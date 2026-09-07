const prisma = require('../lib/prisma');
const { accesoWhere, resolverSedeId } = require('./acceso.util');
const { pymeIdsConCapacidad, exigirCapacidad } = require('./permisos');
const gastosService = require('./gastos.service');
const { agruparPorPeriodo, DIA_MS } = require('../lib/series.util');
const { resolverRango } = require('../lib/periodo.util');

const sum = (arr) => arr.reduce((a, b) => a + b, 0);
const pct = (parte, total) => (total > 0 ? Number(((parte / total) * 100).toFixed(1)) : 0);
// Variación % contra el período anterior. Devuelve null cuando no hay una
// base con la que comparar (período anterior chico, < $10.000) o cuando el %
// se dispara (>300%): comparar la utilidad mensual de un negocio en esos
// casos engaña más que informa, y el front simplemente no muestra el chip
// (los montos de la fórmula ya cuentan la historia).
const variacion = (actual, anterior) => {
  if (Math.abs(anterior) < 10000) return null;
  const v = ((actual - anterior) / Math.abs(anterior)) * 100;
  return Math.abs(v) > 300 ? null : Number(v.toFixed(1));
};

// Unidades base reales de una línea de venta (1 caja de 40 = 40).
const unidadesBase = (v) => v.cantidad * (v.factorPresentacion ?? 1);
// Costo de mercadería vendida de una línea: costo de la presentación por
// cantidad de tickets (costoUnitario ya es "por caja" cuando la venta fue
// por caja), coherente con ventas.service.rankingRentabilidad.
const cogsLinea = (v) => v.costoUnitario * v.cantidad;
const margenLinea = (v) => (v.precioUnitario - v.costoUnitario) * v.cantidad;

const vacio = (periodo) => ({
  periodo,
  moneda: 'COP',
  resumen: {
    ingresos: 0, costoVentas: 0, utilidadBruta: 0, margenBrutoPct: 0,
    gastos: 0, utilidadNeta: 0, margenNetoPct: 0,
    numFacturas: 0, ticketPromedio: 0, unidadesVendidas: 0,
  },
  comparativa: {},
  serie: { granularidad: 'dia', buckets: [] },
  gastosPorCategoria: [],
  gastosRecientes: [],
  rentabilidadProductos: [],
  rentabilidadCategorias: [],
  inventario: { capitalInmovilizado: 0, unidades: 0 },
  proyeccion: null,
  sedes: [],
});

const get = async (user, { pymeId, sedeId, desde, hasta, rango } = {}) => {
  // Rango por defecto: mes en curso. `rango` (atajo) o `desde`/`hasta` explícitos.
  const { desde: desdeD, hasta: hastaD, etiqueta } = resolverRango({ rango, desde, hasta });
  const periodo = { desde: desdeD.toISOString(), hasta: hastaD.toISOString(), etiqueta };

  // Período anterior de igual duración, terminando justo antes de `desdeD`.
  const durMs = Math.max(DIA_MS, hastaD - desdeD);
  const prevHasta = new Date(desdeD.getTime() - 1);
  const prevDesde = new Date(desdeD.getTime() - durMs);

  // --- Permisos: la pantalla ES el reporte financiero. Con pymeId puntual
  // sin la capacidad -> 403; sin pymeId -> se restringe a las PYMES que la dan.
  if (pymeId) await exigirCapacidad(user, pymeId, 'verReportesFinancieros');
  const idsConReportes = pymeId ? null : await pymeIdsConCapacidad(user, 'verReportesFinancieros');
  if (idsConReportes && idsConReportes.length === 0) return vacio(periodo);

  const sedeIdFinal = await resolverSedeId(pymeId, user, sedeId);
  const wherePyme = {
    ...(await accesoWhere(user)),
    ...(pymeId ? { pymeId: Number(pymeId) } : {}),
    ...(idsConReportes ? { pymeId: { in: idsConReportes } } : {}),
  };
  const whereVenta = { ...wherePyme, ...(sedeIdFinal ? { sedeId: sedeIdFinal } : {}) };

  const [ventas, gastos, gastosPrev, inventarios, predicciones, sedes] = await Promise.all([
    prisma.venta.findMany({
      where: { ...whereVenta, fecha: { gte: prevDesde, lte: hastaD } },
      select: {
        total: true, cantidad: true, factorPresentacion: true, precioUnitario: true,
        costoUnitario: true, fecha: true, facturaId: true, sedeId: true,
        producto: { select: { id: true, nombre: true, categoria: true } },
      },
    }),
    gastosService.list(user, { pymeId, sedeId, desde: desdeD.toISOString(), hasta: hastaD.toISOString() }),
    gastosService.list(user, { pymeId, sedeId, desde: prevDesde.toISOString(), hasta: prevHasta.toISOString() }),
    prisma.inventario.findMany({
      where: { producto: whereVenta },
      select: { stockActual: true, producto: { select: { costo: true } } },
    }),
    prisma.prediccion.findMany({
      where: { producto: whereVenta },
      select: { productoId: true, demandaPredicha: true, rentabilidadPredicha: true, horizonteDias: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 400,
    }),
    pymeId ? prisma.sede.findMany({ where: { pymeId: Number(pymeId) }, select: { id: true, nombre: true } }) : Promise.resolve([]),
  ]);

  const enRango = (v) => new Date(v.fecha) >= desdeD;
  const ventasP = ventas.filter(enRango);
  const ventasPrev = ventas.filter((v) => !enRango(v));

  // --- Resumen del período ---
  const ingresos = sum(ventasP.map((v) => v.total));
  const costoVentas = sum(ventasP.map(cogsLinea));
  const utilidadBruta = ingresos - costoVentas;
  const gastosTotal = sum(gastos.map((g) => g.monto));
  const utilidadNeta = utilidadBruta - gastosTotal;
  const facturaIds = new Set(ventasP.map((v) => v.facturaId).filter(Boolean));
  const numFacturas = facturaIds.size || ventasP.length;

  const resumen = {
    ingresos: Math.round(ingresos),
    costoVentas: Math.round(costoVentas),
    utilidadBruta: Math.round(utilidadBruta),
    margenBrutoPct: pct(utilidadBruta, ingresos),
    gastos: Math.round(gastosTotal),
    utilidadNeta: Math.round(utilidadNeta),
    margenNetoPct: pct(utilidadNeta, ingresos),
    numFacturas,
    ticketPromedio: numFacturas ? Math.round(ingresos / numFacturas) : 0,
    unidadesVendidas: sum(ventasP.map(unidadesBase)),
  };

  // --- Comparativa con el período anterior ---
  const ingresosPrev = sum(ventasPrev.map((v) => v.total));
  const utilBrutaPrev = ingresosPrev - sum(ventasPrev.map(cogsLinea));
  const gastosPrevTotal = sum(gastosPrev.map((g) => g.monto));
  const utilNetaPrev = utilBrutaPrev - gastosPrevTotal;
  const comparativa = {
    ingresos: { valor: Math.round(ingresos), anterior: Math.round(ingresosPrev), variacionPct: variacion(ingresos, ingresosPrev) },
    gastos: { valor: Math.round(gastosTotal), anterior: Math.round(gastosPrevTotal), variacionPct: variacion(gastosTotal, gastosPrevTotal) },
    utilidadNeta: { valor: Math.round(utilidadNeta), anterior: Math.round(utilNetaPrev), variacionPct: variacion(utilidadNeta, utilNetaPrev) },
  };

  // --- Serie temporal ingreso vs. egreso ---
  const registrosSerie = [
    ...ventasP.map((v) => ({ fecha: v.fecha, ingresos: v.total, costoVentas: cogsLinea(v), gastos: 0 })),
    ...gastos.map((g) => ({ fecha: g.fecha, ingresos: 0, costoVentas: 0, gastos: g.monto })),
  ];
  const { granularidad, buckets } = agruparPorPeriodo(
    registrosSerie, desdeD, hastaD, ['ingresos', 'costoVentas', 'gastos']
  );
  const serie = {
    granularidad,
    buckets: buckets.map((b) => ({
      key: b.key,
      label: b.label,
      ingresos: Math.round(b.ingresos),
      egresos: Math.round(b.costoVentas + b.gastos),
      costoVentas: Math.round(b.costoVentas),
      gastos: Math.round(b.gastos),
      utilidadNeta: Math.round(b.ingresos - b.costoVentas - b.gastos),
    })),
  };

  // --- Gastos por categoría ---
  const porCat = new Map();
  for (const g of gastos) {
    porCat.set(g.categoria, (porCat.get(g.categoria) || 0) + g.monto);
  }
  const gastosPorCategoria = Array.from(porCat.entries())
    .map(([categoria, monto]) => ({ categoria, total: Math.round(monto), pct: pct(monto, gastosTotal) }))
    .sort((a, b) => b.total - a.total);

  const gastosRecientes = gastos.slice(0, 12).map((g) => ({
    id: g.id, categoria: g.categoria, descripcion: g.descripcion, monto: g.monto,
    fecha: g.fecha, sede: g.sede?.nombre || null, registradoPor: g.registradoPor?.nombre || null,
  }));

  // --- Rentabilidad por producto y categoría (sobre ventas del período) ---
  const prodMap = new Map();
  const catMap = new Map();
  for (const v of ventasP) {
    const p = prodMap.get(v.producto.id) || { id: v.producto.id, nombre: v.producto.nombre, ingresos: 0, costo: 0, unidades: 0 };
    p.ingresos += v.total;
    p.costo += cogsLinea(v);
    p.unidades += unidadesBase(v);
    prodMap.set(v.producto.id, p);

    const catNombre = v.producto.categoria || 'Sin categoría';
    const c = catMap.get(catNombre) || { categoria: catNombre, ingresos: 0, costo: 0, unidades: 0 };
    c.ingresos += v.total;
    c.costo += cogsLinea(v);
    c.unidades += unidadesBase(v);
    catMap.set(catNombre, c);
  }
  const conMargen = (o) => ({
    ...o,
    ingresos: Math.round(o.ingresos),
    costo: Math.round(o.costo),
    margen: Math.round(o.ingresos - o.costo),
    margenPct: pct(o.ingresos - o.costo, o.ingresos),
  });
  const rentabilidadProductos = Array.from(prodMap.values()).map(conMargen).sort((a, b) => b.margen - a.margen);
  const rentabilidadCategorias = Array.from(catMap.values()).map(conMargen).sort((a, b) => b.margen - a.margen);

  // --- Capital inmovilizado en inventario (a costo) ---
  const capitalInmovilizado = Math.round(sum(inventarios.map((i) => i.stockActual * (i.producto?.costo || 0))));
  const unidadesInventario = sum(inventarios.map((i) => i.stockActual));

  // --- Proyección desde las predicciones más recientes por producto ---
  const ultimaPred = new Map();
  for (const p of predicciones) {
    if (!ultimaPred.has(p.productoId)) ultimaPred.set(p.productoId, p);
  }
  const preds = Array.from(ultimaPred.values());
  const proyeccion = preds.length
    ? {
        horizonteDias: preds[0].horizonteDias ?? 7,
        utilidadEstimada: Math.round(sum(preds.map((p) => p.rentabilidadPredicha || 0))),
        productos: preds.length,
      }
    : null;

  // --- Desglose por sede (solo con pymeId puntual y más de una sede) ---
  let sedesResumen = [];
  if (pymeId && sedes.length > 1) {
    const bySede = new Map();
    for (const v of ventasP) {
      const key = v.sedeId ?? 0;
      const e = bySede.get(key) || { sedeId: v.sedeId, ingresos: 0, costo: 0 };
      e.ingresos += v.total;
      e.costo += cogsLinea(v);
      bySede.set(key, e);
    }
    const nombrePorSede = new Map(sedes.map((s) => [s.id, s.nombre]));
    sedesResumen = Array.from(bySede.values())
      .map((e) => ({
        sedeId: e.sedeId,
        nombre: e.sedeId ? nombrePorSede.get(e.sedeId) || `Sede ${e.sedeId}` : 'Sin sede',
        ingresos: Math.round(e.ingresos),
        utilidadBruta: Math.round(e.ingresos - e.costo),
      }))
      .sort((a, b) => b.ingresos - a.ingresos);
  }

  return {
    periodo,
    moneda: 'COP',
    resumen,
    comparativa,
    serie,
    gastosPorCategoria,
    gastosRecientes,
    rentabilidadProductos,
    rentabilidadCategorias,
    inventario: { capitalInmovilizado, unidades: unidadesInventario },
    proyeccion,
    sedes: sedesResumen,
  };
};

module.exports = { get };

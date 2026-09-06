const prisma = require('../lib/prisma');
const { accesoWhere, resolverSedeId } = require('./acceso.util');
const { tieneCapacidad, capacidadEnTodas, exigirCapacidad, pymeIdsConCapacidad } = require('./permisos');
const ventasService = require('./ventas.service');

const sum = (arr) => arr.reduce((acc, v) => acc + v, 0);

const get = async (user, { pymeId, sedeId } = {}) => {
  // Igual que en facturas/predicciones: pymeId puntual sin permiso es 403
  // real, no solo el link de nav escondido — antes esta pantalla no
  // chequeaba nada acá y un VENDEDOR podía pedir /dashboard?pymeId=X de una
  // PYME donde no tiene verDashboard y le llegaban igual alertas de stock
  // con nombre/cantidad reales.
  if (pymeId) await exigirCapacidad(user, pymeId, 'verDashboard');
  const idsConDashboard = pymeId ? null : await pymeIdsConCapacidad(user, 'verDashboard');

  const sedeIdFinal = await resolverSedeId(pymeId, user, sedeId);
  const wherePyme = {
    ...(await accesoWhere(user)),
    ...(pymeId ? { pymeId: Number(pymeId) } : {}),
    ...(idsConDashboard ? { pymeId: { in: idsConDashboard } } : {}),
  };
  const whereVentaInventario = { ...wherePyme, ...(sedeIdFinal ? { sedeId: sedeIdFinal } : {}) };

  // Se resuelve antes del Promise.all: comparativaSedes exige la capacidad
  // ella misma (endpoint expuesto también directo en /ventas/comparativa-sedes),
  // así que si el rol no la tiene, ni se llama — evita que su 403 tumbe el
  // resto del dashboard.
  const verReportes = pymeId
    ? await tieneCapacidad(user, pymeId, 'verReportesFinancieros')
    : await capacidadEnTodas(user, 'verReportesFinancieros');

  const [productos, ventas, inventarios, predicciones, comparativaSedes] = await Promise.all([
    prisma.producto.findMany({
      where: whereVentaInventario,
      select: { id: true, nombre: true },
    }),
    prisma.venta.findMany({
      where: whereVentaInventario,
      select: { total: true, cantidad: true, factorPresentacion: true, precioUnitario: true, costoUnitario: true, fecha: true, productoId: true },
    }),
    prisma.inventario.findMany({
      where: { producto: whereVentaInventario },
      include: { producto: { select: { id: true, nombre: true, codigo: true, precioVenta: true } } },
    }),
    prisma.prediccion.findMany({
      where: { producto: whereVentaInventario },
      include: { producto: { select: { id: true, nombre: true, codigo: true, precioVenta: true, costo: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    pymeId && verReportes ? ventasService.comparativaSedes(user, { pymeId }) : Promise.resolve([]),
  ]);

  const unidadesBase = (v) => v.cantidad * (v.factorPresentacion ?? 1);
  const ingresos = sum(ventas.map((v) => v.total));
  const margenBruto = sum(ventas.map((v) => (v.precioUnitario - v.costoUnitario) * v.cantidad));
  const unidadesVendidas = sum(ventas.map(unidadesBase));

  const hoy = new Date();
  const hace7Dias = new Date(hoy.getTime() - 7 * 24 * 60 * 60 * 1000);

  const ventasUltimos7Dias = ventas.filter((v) => v.fecha >= hace7Dias);
  const ventasPorDia = Array.from({ length: 7 }, (_, i) => {
    const dia = new Date(hoy.getTime() - (6 - i) * 24 * 60 * 60 * 1000);
    const key = dia.toISOString().slice(0, 10);
    const delDia = ventasUltimos7Dias.filter((v) => v.fecha.toISOString().slice(0, 10) === key);
    return {
      fecha: key,
      ventas: delDia.length,
      ingresos: sum(delDia.map((v) => v.total)),
    };
  });

  // Series para el selector de rango de la gráfica de ventas del dashboard
  // (Semana / Mes / Trimestre / Año). Se calculan las cuatro y viajan en la
  // misma respuesta: el front cambia de rango al instante, sin volver a
  // pedir datos. Cada bucket ya trae su etiqueta de eje X lista.
  const DIA_MS = 24 * 60 * 60 * 1000;
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const etiquetaDia = (f) => `${String(f.getUTCDate()).padStart(2, '0')} ${MESES[f.getUTCMonth()]}`;
  const claveDiaUTC = (f) => f.toISOString().slice(0, 10);
  const claveMesUTC = (f) => f.toISOString().slice(0, 7);
  const lunesUTC = (f) => {
    const d = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate()));
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // 0 = lunes
    return d;
  };
  const acumular = (claveFn) => {
    const m = new Map();
    for (const v of ventas) {
      const k = claveFn(v.fecha);
      const cur = m.get(k) || { ingresos: 0, ventas: 0 };
      cur.ingresos += v.total;
      cur.ventas += 1;
      m.set(k, cur);
    }
    return m;
  };
  const bucket = (m, key, label) => {
    const { ingresos = 0, ventas: n = 0 } = m.get(key) || {};
    return { key, label, ventas: n, ingresos: Math.round(ingresos) };
  };

  const porDiaMap = acumular(claveDiaUTC);
  const porSemanaMap = acumular((f) => claveDiaUTC(lunesUTC(f)));
  const porMesMap = acumular(claveMesUTC);

  const serieDiaria = (n) => Array.from({ length: n }, (_, i) => {
    const dia = new Date(hoy.getTime() - (n - 1 - i) * DIA_MS);
    return bucket(porDiaMap, claveDiaUTC(dia), etiquetaDia(dia));
  });
  const serieSemanal = (n) => {
    const lunesHoy = lunesUTC(hoy);
    return Array.from({ length: n }, (_, i) => {
      const ini = new Date(lunesHoy.getTime() - (n - 1 - i) * 7 * DIA_MS);
      return bucket(porSemanaMap, claveDiaUTC(ini), etiquetaDia(ini));
    });
  };
  const serieMensual = (n) => Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - (n - 1 - i), 1));
    return bucket(porMesMap, claveMesUTC(d), MESES[d.getUTCMonth()]);
  });

  const ventasSeries = {
    semana: serieDiaria(7),
    mes: serieDiaria(30),
    trimestre: serieSemanal(13),
    anio: serieMensual(12),
  };

  const ventasPorProducto = {};
  for (const v of ventas) {
    ventasPorProducto[v.productoId] = ventasPorProducto[v.productoId] || { ingresos: 0, unidades: 0 };
    ventasPorProducto[v.productoId].ingresos += v.total;
    ventasPorProducto[v.productoId].unidades += unidadesBase(v);
  }

  const topProductos = productos
    .map((p) => ({
      id: p.id,
      nombre: p.nombre,
      ...(ventasPorProducto[p.id] || { ingresos: 0, unidades: 0 }),
    }))
    .sort((a, b) => b.ingresos - a.ingresos)
    .slice(0, 5);

  const productosBajoStock = inventarios
    .filter((inv) => inv.stockActual <= inv.stockMinimo)
    .map((inv) => ({
      id: inv.producto.id,
      nombre: inv.producto.nombre,
      codigo: inv.producto.codigo,
      stockActual: inv.stockActual,
      stockMinimo: inv.stockMinimo,
    }));

  const ultimaPorProducto = new Map();
  for (const p of predicciones) {
    if (!ultimaPorProducto.has(p.productoId)) ultimaPorProducto.set(p.productoId, p);
  }

  const rankingRentabilidad = Array.from(ultimaPorProducto.values())
    .map((p) => ({
      id: p.producto.id,
      nombre: p.producto.nombre,
      codigo: p.producto.codigo,
      demandaPredicha: p.demandaPredicha,
      rentabilidadPredicha: p.rentabilidadPredicha,
      nivelConfianza: p.nivelConfianza,
    }))
    .sort((a, b) => b.rentabilidadPredicha - a.rentabilidadPredicha);

  const resultado = {
    resumen: {
      ingresos: Math.round(ingresos),
      margenBruto: Math.round(margenBruto),
      unidadesVendidas,
      numeroProductos: productos.length,
      alertasStock: productosBajoStock.length,
    },
    ventasPorDia,
    ventasSeries,
    topProductos,
    productosBajoStock,
    rankingRentabilidad,
    comparativaSedes,
  };

  if (!verReportes) {
    delete resultado.resumen.ingresos;
    delete resultado.resumen.margenBruto;
    resultado.ventasPorDia = [];
    resultado.ventasSeries = { semana: [], mes: [], trimestre: [], anio: [] };
    resultado.topProductos = [];
    resultado.rankingRentabilidad = [];
    resultado.comparativaSedes = [];
  }

  return resultado;
};

module.exports = { get };

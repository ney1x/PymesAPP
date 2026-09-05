const prisma = require('../lib/prisma');
const ApiError = require('../utils/ApiError');
const mlClient = require('../lib/mlClient');
const { accesoWhere, tieneAcceso, resolverSedeId } = require('./acceso.util');
const { exigirCapacidad, tieneCapacidad, pymeIdsConCapacidad, ocultarCosto } = require('./permisos');

const historicoDeProducto = async (productoId, dias = 90) => {
  const desde = new Date();
  desde.setDate(desde.getDate() - dias);

  const ventas = await prisma.venta.findMany({
    where: { productoId: Number(productoId), fecha: { gte: desde } },
    orderBy: { fecha: 'asc' },
    select: {
      fecha: true,
      cantidad: true,
      factorPresentacion: true,
      precioUnitario: true,
      costoUnitario: true,
    },
  });

  // `cantidad` en unidad base: la heurística de fallback y los promedios
  // trabajan en la misma unidad que el stock y el motor de IA.
  return ventas.map((v) => ({
    fecha: v.fecha,
    cantidad: v.cantidad * (v.factorPresentacion ?? 1),
    precioUnitario: v.precioUnitario,
    costoUnitario: v.costoUnitario,
  }));
};

const findProducto = async (productoId, user) => {
  const producto = await prisma.producto.findUnique({
    where: { id: Number(productoId) },
    include: { pyme: true, inventario: true },
  });
  if (!producto) throw new ApiError(404, 'Producto no encontrado');
  if (!(await tieneAcceso(producto, user))) {
    throw new ApiError(403, 'No tiene acceso a este producto');
  }
  return producto;
};

const HORIZONTES_VALIDOS = [7, 30, 90];

const heuristica = (historico, horizonteDias = 7) => {
  const total = historico.reduce((acc, v) => acc + v.cantidad, 0);
  const dias = Math.max(1, historico.length);
  const promedioDiario = total / dias;
  return {
    demandaPredicha: Math.round(promedioDiario * horizonteDias),
    nivelConfianza: 0.3,
    metodo: 'heuristica',
  };
};

// Cuerpo real, sin chequeo de capacidad `generarPredicciones` — lo llama
// internamente ventas.service tras cada venta (efecto de sistema, no una
// acción directa del usuario; ya es fire-and-forget con .catch, así que un
// VENDEDOR sin esa capacidad no debe hacer que la predicción se rompa).
const _generarParaProducto = async (user, productoId, horizonteDiasInput) => {
  const producto = await findProducto(productoId, user);
  const horizonteDias = HORIZONTES_VALIDOS.includes(Number(horizonteDiasInput))
    ? Number(horizonteDiasInput)
    : 7;

  let prediccion;
  try {
    prediccion = await mlClient.predict({
      itemId: producto.codigo,
      storeId: String(producto.sedeId ?? producto.pymeId),
      horizonteDias,
    });
  } catch (err) {
    console.error('[ML] No se pudo contactar el servicio de ML, usando heurística local:', err.message);
    const historico = await historicoDeProducto(producto.id);
    prediccion = heuristica(historico, horizonteDias);
  }

  const margen = producto.precioVenta - producto.costo;
  const rentabilidadPredicha = margen * (prediccion.demandaPredicha || 0);

  const saved = await prisma.prediccion.create({
    data: {
      productoId: producto.id,
      fecha: new Date(),
      demandaPredicha: prediccion.demandaPredicha || 0,
      nivelConfianza: prediccion.nivelConfianza || 0,
      rentabilidadPredicha,
      horizonteDias,
      estado: 'PENDIENTE',
    },
  });

  return {
    ...saved,
    producto: {
      id: producto.id,
      nombre: producto.nombre,
      codigo: producto.codigo,
      margen,
      stockActual: producto.inventario?.stockActual ?? 0,
    },
    metodo: prediccion.metodo || 'ml',
  };
};

// Wrapper de ruta (POST /predicciones/generar/:productoId): exige la
// capacidad antes de delegar en el cuerpo real.
const generarParaProducto = async (user, productoId, horizonteDiasInput) => {
  const producto = await findProducto(productoId, user);
  await exigirCapacidad(user, producto.pymeId, 'generarPredicciones');
  return _generarParaProducto(user, productoId, horizonteDiasInput);
};

const generarTodo = async (user, { pymeId, sedeId, horizonteDias } = {}) => {
  const sedeIdFinal = await resolverSedeId(pymeId, user, sedeId);

  if (pymeId) await exigirCapacidad(user, pymeId, 'generarPredicciones');
  const idsPermitidos = pymeId ? null : await pymeIdsConCapacidad(user, 'generarPredicciones');

  const productos = await prisma.producto.findMany({
    where: {
      ...(await accesoWhere(user)),
      ...(pymeId ? { pymeId: Number(pymeId) } : {}),
      ...(sedeIdFinal ? { sedeId: sedeIdFinal } : {}),
      ...(idsPermitidos ? { pymeId: { in: idsPermitidos } } : {}),
    },
  });

  const resultados = [];
  for (const producto of productos) {
    resultados.push(await _generarParaProducto(user, producto.id, horizonteDias));
  }

  const ranking = resultados.sort(
    (a, b) => b.rentabilidadPredicha - a.rentabilidadPredicha
  );

  return ranking;
};

const list = async (user, { productoId, pymeId, sedeId } = {}) => {
  const sedeIdFinal = await resolverSedeId(pymeId, user, sedeId);

  if (pymeId) {
    await exigirCapacidad(user, pymeId, 'verPredicciones');
  }
  const idsConVista = pymeId ? null : await pymeIdsConCapacidad(user, 'verPredicciones');

  const predicciones = await prisma.prediccion.findMany({
    where: {
      producto: {
        ...(await accesoWhere(user)),
        ...(pymeId ? { pymeId: Number(pymeId) } : {}),
        ...(sedeIdFinal ? { sedeId: sedeIdFinal } : {}),
        ...(idsConVista ? { pymeId: { in: idsConVista } } : {}),
      },
      ...(productoId ? { productoId: Number(productoId) } : {}),
    },
    include: { producto: true },
    orderBy: { createdAt: 'desc' },
    distinct: ['productoId'],
    take: 100,
  });

  // INVENTARIO ve demanda pero no rentabilidad en $ (métrica financiera).
  const idsConReportes = pymeId
    ? null
    : await pymeIdsConCapacidad(user, 'verReportesFinancieros');
  for (const p of predicciones) {
    const tieneReportes = pymeId
      ? await tieneCapacidad(user, pymeId, 'verReportesFinancieros')
      : idsConReportes === null || idsConReportes.includes(p.producto.pymeId);
    if (!tieneReportes) {
      delete p.rentabilidadPredicha;
      ocultarCosto(p.producto);
    }
  }

  return predicciones;
};

const predecir = async (productoId, pymeId, horizonteDias = 7) => {
  const producto = await prisma.producto.findUnique({
    where: { id: Number(productoId) },
    include: { pyme: true, inventario: true },
  });
  if (!producto) throw new ApiError(404, 'Producto no encontrado');
  if (producto.pymeId !== Number(pymeId)) throw new ApiError(403, 'No tiene acceso a este producto');

  let prediccion;
  try {
    prediccion = await mlClient.predict({
      itemId: producto.codigo,
      storeId: String(producto.sedeId ?? producto.pymeId),
      horizonteDias,
    });
  } catch (err) {
    const historico = await historicoDeProducto(producto.id);
    prediccion = heuristica(historico, horizonteDias);
  }

  return {
    demandaPredicha: prediccion.demandaPredicha || 0,
    nivelConfianza: prediccion.nivelConfianza || 0,
    metodo: prediccion.metodo || 'heuristica',
  };
};

module.exports = { generarParaProducto, generarParaProductoInterno: _generarParaProducto, generarTodo, list, predecir };

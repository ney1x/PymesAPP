const prisma = require('../lib/prisma');
const ApiError = require('../utils/ApiError');
const mlClient = require('../lib/mlClient');
const { accesoWhere, tieneAcceso, resolverSedeId } = require('./acceso.util');

const historicoDeProducto = async (productoId, dias = 90) => {
  const desde = new Date();
  desde.setDate(desde.getDate() - dias);

  return prisma.venta.findMany({
    where: { productoId: Number(productoId), fecha: { gte: desde } },
    orderBy: { fecha: 'asc' },
    select: {
      fecha: true,
      cantidad: true,
      precioUnitario: true,
      costoUnitario: true,
    },
  });
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

const generarParaProducto = async (user, productoId, horizonteDiasInput) => {
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

const generarTodo = async (user, { pymeId, sedeId, horizonteDias } = {}) => {
  const sedeIdFinal = await resolverSedeId(pymeId, user, sedeId);

  const productos = await prisma.producto.findMany({
    where: {
      ...(await accesoWhere(user)),
      ...(pymeId ? { pymeId: Number(pymeId) } : {}),
      ...(sedeIdFinal ? { sedeId: sedeIdFinal } : {}),
    },
  });

  const resultados = [];
  for (const producto of productos) {
    resultados.push(await generarParaProducto(user, producto.id, horizonteDias));
  }

  const ranking = resultados.sort(
    (a, b) => b.rentabilidadPredicha - a.rentabilidadPredicha
  );

  return ranking;
};

const list = async (user, { productoId, pymeId, sedeId } = {}) => {
  const sedeIdFinal = await resolverSedeId(pymeId, user, sedeId);

  return prisma.prediccion.findMany({
    where: {
      producto: {
        ...(await accesoWhere(user)),
        ...(pymeId ? { pymeId: Number(pymeId) } : {}),
        ...(sedeIdFinal ? { sedeId: sedeIdFinal } : {}),
      },
      ...(productoId ? { productoId: Number(productoId) } : {}),
    },
    include: { producto: true },
    orderBy: { createdAt: 'desc' },
    distinct: ['productoId'],
    take: 100,
  });
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

module.exports = { generarParaProducto, generarTodo, list, predecir };

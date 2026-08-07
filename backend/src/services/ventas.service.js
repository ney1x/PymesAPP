const prisma = require('../lib/prisma');
const ApiError = require('../utils/ApiError');
const inventarioService = require('./inventario.service');
const prediccionesService = require('./predicciones.service');
const iaSync = require('../lib/iaSync');

const list = async (user, { pymeId, desde, hasta } = {}) => {
  const wherePyme = user.rol === 'ADMIN' ? {} : { userId: user.id };

  const where = {
    pyme: wherePyme,
    ...(pymeId ? { pymeId: Number(pymeId) } : {}),
    ...(desde || hasta
      ? {
          fecha: {
            ...(desde ? { gte: new Date(desde) } : {}),
            ...(hasta ? { lte: new Date(hasta) } : {}),
          },
        }
      : {}),
  };

  return prisma.venta.findMany({
    where,
    include: { producto: true },
    orderBy: { fecha: 'desc' },
  });
};

const create = async (user, data) => {
  const { productoId, pymeId, cantidad, precioUnitario } = data;

  const producto = await prisma.producto.findUnique({
    where: { id: Number(productoId) },
    include: { pyme: true },
  });

  if (!producto) throw new ApiError(404, 'Producto no encontrado');
  if (user.rol !== 'ADMIN' && producto.pyme.userId !== user.id) {
    throw new ApiError(403, 'No tiene acceso a este producto');
  }

  const inventario = await prisma.inventario.findUnique({ where: { productoId: producto.id } });
  if (inventario && cantidad > inventario.stockActual) {
    throw new ApiError(400, `Stock insuficiente: quedan ${inventario.stockActual} unidades`);
  }

  const pymeIdReal = pymeId ? Number(pymeId) : producto.pymeId;

  const venta = await prisma.$transaction(async (tx) => {
    const created = await tx.venta.create({
      data: {
        pymeId: pymeIdReal,
        productoId: producto.id,
        cantidad,
        precioUnitario,
        costoUnitario: producto.costo,
        total: precioUnitario * cantidad,
      },
    });

    await tx.inventario.updateMany({
      where: { productoId: producto.id },
      data: { stockActual: { decrement: cantidad } },
    });

    return created;
  });

  // Espejo hacia el motor de IA. No debe impedir registrar la venta si falla.
  try {
    await iaSync.syncVenta({
      producto,
      pyme: producto.pyme,
      cantidad,
      precioUnitario,
      fecha: venta.fecha,
    });
  } catch (err) {
    console.error('[iaSync]', err.message);
  }

  // Disparar predicción en segundo plano sin bloquear la respuesta.
  prediccionesService
    .generarParaProducto(user, producto.id)
    .catch((err) => console.error('[prediccion]', err.message));

  return venta;
};

const historialProducto = async (productoId, dias = 30) => {
  const desde = new Date();
  desde.setDate(desde.getDate() - dias);

  return prisma.venta.findMany({
    where: { productoId: Number(productoId), fecha: { gte: desde } },
    orderBy: { fecha: 'asc' },
    select: { fecha: true, cantidad: true, precioUnitario: true, total: true },
  });
};

module.exports = { list, create, historialProducto };

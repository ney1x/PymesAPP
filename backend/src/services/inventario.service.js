const prisma = require('../lib/prisma');
const ApiError = require('../utils/ApiError');

const list = async (user, { alertas, pymeId } = {}) => {
  const wherePyme = user.rol === 'ADMIN' ? {} : { userId: user.id };

  const inventarios = await prisma.inventario.findMany({
    where: {
      producto: {
        pyme: wherePyme,
        ...(pymeId ? { pymeId: Number(pymeId) } : {}),
      },
    },
    include: {
      producto: { include: { pyme: true } },
    },
    orderBy: [{ stockActual: 'asc' }],
  });

  const withAlerta = inventarios.map((inv) => ({
    ...inv,
    alerta: inv.stockActual <= inv.stockMinimo,
  }));

  if (alertas === 'true') {
    return withAlerta.filter((inv) => inv.alerta);
  }

  return withAlerta;
};

const update = async (id, user, data) => {
  const inventario = await prisma.inventario.findUnique({
    where: { id: Number(id) },
    include: { producto: { include: { pyme: true } } },
  });

  if (!inventario) throw new ApiError(404, 'Inventario no encontrado');
  if (user.rol !== 'ADMIN' && inventario.producto.pyme.userId !== user.id) {
    throw new ApiError(403, 'No tiene acceso a este inventario');
  }

  const updated = await prisma.inventario.update({
    where: { id: inventario.id },
    data: {
      stockActual: data.stockActual ?? undefined,
      stockMinimo: data.stockMinimo ?? undefined,
      stockMaximo: data.stockMaximo ?? undefined,
      ubicacion: data.ubicacion ?? undefined,
    },
  });

  return { ...updated, alerta: updated.stockActual <= updated.stockMinimo };
};

const ajustarStock = async (productoId, cantidad, user) => {
  const inventario = await prisma.inventario.findUnique({
    where: { productoId: Number(productoId) },
    include: { producto: { include: { pyme: true } } },
  });

  if (!inventario) throw new ApiError(404, 'Inventario no encontrado para el producto');
  if (user.rol !== 'ADMIN' && inventario.producto.pyme.userId !== user.id) {
    throw new ApiError(403, 'No tiene acceso a este inventario');
  }

  return prisma.inventario.update({
    where: { id: inventario.id },
    data: { stockActual: { increment: cantidad } },
  });
};

module.exports = { list, update, ajustarStock };

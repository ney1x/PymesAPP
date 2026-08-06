const prisma = require('../lib/prisma');
const ApiError = require('../utils/ApiError');

const scopeQuery = (user) =>
  user.rol === 'ADMIN' ? {} : { userId: user.id };

const canAccess = (pyme, user) => {
  if (user.rol === 'ADMIN') return true;
  return pyme.userId === user.id;
};

const list = async (user, { search } = {}) => {
  return prisma.pyme.findMany({
    where: {
      ...scopeQuery(user),
      ...(search ? { nombre: { contains: search } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { productos: true, ventas: true } },
    },
  });
};

const getById = async (id, user) => {
  const pyme = await prisma.pyme.findUnique({
    where: { id: Number(id) },
    include: { productos: { include: { inventario: true } } },
  });
  if (!pyme) throw new ApiError(404, 'PYME no encontrada');
  if (!canAccess(pyme, user)) throw new ApiError(403, 'No tiene acceso a esta PYME');
  return pyme;
};

const create = async (user, data) => {
  return prisma.pyme.create({
    data: { ...data, userId: user.id },
  });
};

const update = async (id, user, data) => {
  const pyme = await prisma.pyme.findUnique({ where: { id: Number(id) } });
  if (!pyme) throw new ApiError(404, 'PYME no encontrada');
  if (!canAccess(pyme, user)) throw new ApiError(403, 'No tiene acceso a esta PYME');

  return prisma.pyme.update({ where: { id: pyme.id }, data });
};

const remove = async (id, user) => {
  const pyme = await prisma.pyme.findUnique({ where: { id: Number(id) } });
  if (!pyme) throw new ApiError(404, 'PYME no encontrada');
  if (!canAccess(pyme, user)) throw new ApiError(403, 'No tiene acceso a esta PYME');

  const productos = await prisma.producto.findMany({
    where: { pymeId: pyme.id },
    select: { id: true },
  });
  const productoIds = productos.map((p) => p.id);

  await prisma.$transaction([
    prisma.venta.deleteMany({ where: { pymeId: pyme.id } }),
    prisma.prediccion.deleteMany({ where: { productoId: { in: productoIds } } }),
    prisma.inventario.deleteMany({ where: { productoId: { in: productoIds } } }),
    prisma.producto.deleteMany({ where: { pymeId: pyme.id } }),
    prisma.pyme.delete({ where: { id: pyme.id } }),
  ]);

  return pyme;
};

module.exports = { list, getById, create, update, remove };

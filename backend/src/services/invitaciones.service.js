const prisma = require('../lib/prisma');
const ApiError = require('../utils/ApiError');

const listPendientes = async (user) => {
  return prisma.pyme_membresia.findMany({
    where: { userId: user.id, estado: 'PENDIENTE', activo: true },
    include: {
      pyme: { select: { id: true, nombre: true, tipo: true, ciudad: true } },
      sede: { select: { id: true, nombre: true } },
      invitadoPor: { select: { id: true, nombre: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
};

const findPropiaPendiente = async (id, user) => {
  const membresia = await prisma.pyme_membresia.findUnique({ where: { id: Number(id) } });
  if (!membresia) throw new ApiError(404, 'Invitación no encontrada');
  if (membresia.userId !== user.id) throw new ApiError(403, 'Esta invitación no es tuya');
  if (membresia.estado !== 'PENDIENTE') throw new ApiError(400, 'Esta invitación ya fue respondida');
  return membresia;
};

const aceptar = async (id, user) => {
  const membresia = await findPropiaPendiente(id, user);
  return prisma.pyme_membresia.update({
    where: { id: membresia.id },
    data: { estado: 'ACEPTADA', respondidoAt: new Date(), decisionVistaPorOwner: false },
    include: { pyme: { select: { id: true, nombre: true } } },
  });
};

const rechazar = async (id, user) => {
  const membresia = await findPropiaPendiente(id, user);
  return prisma.pyme_membresia.update({
    where: { id: membresia.id },
    data: { estado: 'RECHAZADA', respondidoAt: new Date(), decisionVistaPorOwner: false },
    include: { pyme: { select: { id: true, nombre: true } } },
  });
};

module.exports = { listPendientes, aceptar, rechazar };

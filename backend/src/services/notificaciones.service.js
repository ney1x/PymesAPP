const prisma = require('../lib/prisma');
const ApiError = require('../utils/ApiError');

const resumen = async (user) => {
  const [invitacionesPendientes, mensajesNoLeidos, decisionesPendientes] = await Promise.all([
    prisma.pyme_membresia.count({ where: { userId: user.id, estado: 'PENDIENTE', activo: true } }),
    prisma.mensaje.count({ where: { destinatarioId: user.id, leido: false } }),
    prisma.pyme_membresia.count({
      where: { invitadoPorId: user.id, estado: { in: ['ACEPTADA', 'RECHAZADA'] }, decisionVistaPorOwner: false },
    }),
  ]);

  return {
    invitacionesPendientes,
    mensajesNoLeidos,
    decisionesPendientes,
    total: invitacionesPendientes + mensajesNoLeidos + decisionesPendientes,
  };
};

// Avisos para el owner: alguien aceptó o rechazó una invitación que él mandó.
const decisionesPendientes = async (user) => {
  return prisma.pyme_membresia.findMany({
    where: { invitadoPorId: user.id, estado: { in: ['ACEPTADA', 'RECHAZADA'] }, decisionVistaPorOwner: false },
    include: {
      user: { select: { id: true, nombre: true, email: true } },
      pyme: { select: { id: true, nombre: true } },
      rolesExtra: true,
    },
    orderBy: { respondidoAt: 'desc' },
  });
};

const descartarDecision = async (id, user) => {
  const membresia = await prisma.pyme_membresia.findUnique({ where: { id: Number(id) } });
  if (!membresia) throw new ApiError(404, 'No encontrado');
  if (membresia.invitadoPorId !== user.id) throw new ApiError(403, 'No autorizado');
  return prisma.pyme_membresia.update({ where: { id: membresia.id }, data: { decisionVistaPorOwner: true } });
};

module.exports = { resumen, decisionesPendientes, descartarDecision };

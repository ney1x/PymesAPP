const crypto = require('crypto');
const prisma = require('../lib/prisma');
const ApiError = require('../utils/ApiError');

const ROLES_DESTINO = ['VENDEDOR', 'INVENTARIO', 'ANALISTA'];
const PRIORIDADES = ['BAJA', 'NORMAL', 'ALTA'];

// Envía del OWNER a un miembro puntual o a todos los de un rol (fan-out: una
// fila por destinatario, cada una con su propio estado de leído).
const enviar = async (pymeId, remitente, { destinatarioId, rol, contenido, prioridad }) => {
  const texto = (contenido || '').trim();
  if (!texto) throw new ApiError(400, 'El mensaje no puede estar vacío');
  if (!destinatarioId && !rol) throw new ApiError(400, 'Indica un destinatario o un rol');
  if (destinatarioId && rol) throw new ApiError(400, 'Elige destinatario individual o por rol, no ambos');
  if (prioridad && !PRIORIDADES.includes(prioridad)) throw new ApiError(400, 'Prioridad inválida');
  const prioridadFinal = prioridad || 'NORMAL';

  if (destinatarioId) {
    const membresia = await prisma.pyme_membresia.findFirst({
      where: { pymeId: Number(pymeId), userId: Number(destinatarioId), activo: true, estado: 'ACEPTADA' },
    });
    if (!membresia) throw new ApiError(404, 'Ese usuario no es miembro activo de la PYME');

    const mensaje = await prisma.mensaje.create({
      data: {
        pymeId: Number(pymeId),
        remitenteId: remitente.id,
        destinatarioId: Number(destinatarioId),
        prioridad: prioridadFinal,
        contenido: texto,
      },
    });
    return [mensaje];
  }

  if (!ROLES_DESTINO.includes(rol)) throw new ApiError(400, 'Rol inválido');
  const miembros = await prisma.pyme_membresia.findMany({
    where: {
      pymeId: Number(pymeId),
      activo: true,
      estado: 'ACEPTADA',
      // rol combinado: alguien con VENDEDOR como rol extra también debe
      // recibir el mensaje "para todos los VENDEDOR", no solo quien lo tenga
      // como rol principal.
      OR: [{ rol }, { rolesExtra: { some: { rol } } }],
    },
  });
  if (!miembros.length) throw new ApiError(404, `No hay miembros activos con rol ${rol}`);

  const envioLoteId = crypto.randomUUID();
  return prisma.$transaction(
    miembros.map((m) =>
      prisma.mensaje.create({
        data: {
          pymeId: Number(pymeId),
          remitenteId: remitente.id,
          destinatarioId: m.userId,
          rolDestino: rol,
          prioridad: prioridadFinal,
          envioLoteId,
          contenido: texto,
        },
      })
    )
  );
};

const bandejaEntrada = async (user, { soloNoLeidos, prioridad } = {}) => {
  if (prioridad && !PRIORIDADES.includes(prioridad)) throw new ApiError(400, 'Prioridad inválida');

  return prisma.mensaje.findMany({
    where: {
      destinatarioId: user.id,
      ...(soloNoLeidos === 'true' ? { leido: false } : {}),
      ...(prioridad ? { prioridad } : {}),
    },
    include: {
      remitente: { select: { id: true, nombre: true } },
      pyme: { select: { id: true, nombre: true } },
    },
    orderBy: [{ createdAt: 'desc' }],
    take: 200,
  });
};

const marcarLeido = async (id, user) => {
  const mensaje = await prisma.mensaje.findUnique({ where: { id: Number(id) } });
  if (!mensaje) throw new ApiError(404, 'Mensaje no encontrado');
  if (mensaje.destinatarioId !== user.id) throw new ApiError(403, 'No tienes acceso a este mensaje');
  return prisma.mensaje.update({ where: { id: mensaje.id }, data: { leido: true } });
};

// Historial enviado por el OWNER, agrupado por envioLoteId para no repetir
// N filas idénticas cuando fue un envío por rol.
const enviados = async (pymeId, remitenteId) => {
  const mensajes = await prisma.mensaje.findMany({
    where: { pymeId: Number(pymeId), remitenteId },
    include: { destinatario: { select: { id: true, nombre: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  });

  const grupos = new Map();
  for (const m of mensajes) {
    const key = m.envioLoteId || `individual-${m.id}`;
    if (!grupos.has(key)) {
      grupos.set(key, {
        id: key,
        contenido: m.contenido,
        rolDestino: m.rolDestino,
        prioridad: m.prioridad,
        createdAt: m.createdAt,
        destinatarios: [],
      });
    }
    grupos.get(key).destinatarios.push({ ...m.destinatario, leido: m.leido });
  }
  return Array.from(grupos.values());
};

module.exports = { enviar, bandejaEntrada, marcarLeido, enviados };

const prisma = require('../lib/prisma');

// Condiciones OR que describen todo lo que el usuario puede ver a nivel
// pyme+sede: ADMIN sin restricción, dueño histórico ve toda su(s) pyme(s),
// cada membresía sin sedeId ve toda la pyme, y con sedeId solo esa sede.
// Se usa como `where: { OR: await accesoCondiciones(user), ... }` contra
// cualquier modelo con pymeId (y opcionalmente sedeId): producto, venta.
const accesoCondiciones = async (user) => {
  if (user.rol === 'ADMIN') return [{}];

  const [pymesPropias, membresias] = await Promise.all([
    prisma.pyme.findMany({ where: { userId: user.id }, select: { id: true } }),
    prisma.pyme_membresia.findMany({ where: { userId: user.id, activo: true } }),
  ]);

  const condiciones = pymesPropias.map((p) => ({ pymeId: p.id }));
  for (const m of membresias) {
    condiciones.push(m.sedeId ? { pymeId: m.pymeId, sedeId: m.sedeId } : { pymeId: m.pymeId });
  }

  return condiciones.length ? condiciones : [{ pymeId: -1 }];
};

// Chequeo puntual sobre una entidad ya cargada (debe traer pymeId, sedeId y
// pyme.userId). Usado en getById/update/remove donde ya se tiene el registro.
const tieneAcceso = async (entidad, user) => {
  if (user.rol === 'ADMIN') return true;
  if (entidad.pyme?.userId === user.id) return true;

  const membresia = await prisma.pyme_membresia.findFirst({
    where: { pymeId: entidad.pymeId, userId: user.id, activo: true },
  });
  if (!membresia) return false;
  if (membresia.sedeId && entidad.sedeId && membresia.sedeId !== entidad.sedeId) return false;
  return true;
};

// Sanea el sedeId pedido por query/body contra la restricción real del
// usuario para esa pyme: si su membresía lo limita a una sede, esa manda sin
// importar qué haya pedido (evita que cambie el query param a mano).
const resolverSedeId = async (pymeId, user, sedeIdSolicitado) => {
  if (!pymeId || user.rol === 'ADMIN') {
    return sedeIdSolicitado ? Number(sedeIdSolicitado) : undefined;
  }

  const pyme = await prisma.pyme.findUnique({ where: { id: Number(pymeId) } });
  if (pyme?.userId === user.id) {
    return sedeIdSolicitado ? Number(sedeIdSolicitado) : undefined;
  }

  const membresia = await prisma.pyme_membresia.findFirst({
    where: { pymeId: Number(pymeId), userId: user.id, activo: true },
  });
  if (membresia?.sedeId) return membresia.sedeId;

  return sedeIdSolicitado ? Number(sedeIdSolicitado) : undefined;
};

module.exports = { accesoCondiciones, tieneAcceso, resolverSedeId };

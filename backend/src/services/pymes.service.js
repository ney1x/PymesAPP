const prisma = require('../lib/prisma');
const ApiError = require('../utils/ApiError');
const { exigirCapacidad } = require('./permisos');

// Roles asignables a un miembro invitado. OWNER no está acá: se asigna solo
// al crear la PYME (pyme.userId), nunca por este flujo de invitación.
const ROLES_COMBINABLES = ['VENDEDOR', 'INVENTARIO', 'ANALISTA'];

const rolesValidos = (roles) =>
  Array.isArray(roles) && roles.length >= 1 && roles.every((r) => ROLES_COMBINABLES.includes(r));

const scopeQuery = async (user) => {
  if (user.rol === 'ADMIN') return {};
  const membresias = await prisma.pyme_membresia.findMany({
    where: { userId: user.id, activo: true, estado: 'ACEPTADA' },
    select: { pymeId: true },
  });
  const pymeIds = membresias.map((m) => m.pymeId);
  return { OR: [{ userId: user.id }, { id: { in: pymeIds } }] };
};

const canAccess = async (pyme, user) => {
  if (user.rol === 'ADMIN') return true;
  if (pyme.userId === user.id) return true;
  const membresia = await prisma.pyme_membresia.findFirst({
    where: { pymeId: pyme.id, userId: user.id, activo: true, estado: 'ACEPTADA' },
  });
  return !!membresia;
};

// miRoles adjuntado por pyme: le dice al frontend qué controles puede
// mostrar (gestión de equipo/sedes, botones por capacidad) sin tener que
// adivinar por otra vía. Un miembro puede tener más de un rol a la vez.
const list = async (user, { search } = {}) => {
  const pymes = await prisma.pyme.findMany({
    where: {
      ...(await scopeQuery(user)),
      ...(search ? { nombre: { contains: search } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { productos: true, ventas: true } },
    },
  });

  if (user.rol === 'ADMIN') {
    return pymes.map((p) => ({ ...p, miRoles: ['OWNER'] }));
  }

  const membresias = await prisma.pyme_membresia.findMany({
    where: { userId: user.id, pymeId: { in: pymes.map((p) => p.id) }, activo: true, estado: 'ACEPTADA' },
    include: { rolesExtra: true },
  });
  const rolesPorPyme = new Map(
    membresias.map((m) => [m.pymeId, [m.rol, ...m.rolesExtra.map((r) => r.rol)]])
  );

  return pymes.map((p) => ({
    ...p,
    miRoles: p.userId === user.id ? ['OWNER'] : rolesPorPyme.get(p.id) || [],
  }));
};

const getById = async (id, user) => {
  const pyme = await prisma.pyme.findUnique({
    where: { id: Number(id) },
    include: { productos: { include: { inventario: true } } },
  });
  if (!pyme) throw new ApiError(404, 'PYME no encontrada');
  if (!(await canAccess(pyme, user))) throw new ApiError(403, 'No tiene acceso a esta PYME');
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
  if (!(await canAccess(pyme, user))) throw new ApiError(403, 'No tiene acceso a esta PYME');
  await exigirCapacidad(user, pyme.id, 'gestionarPyme');

  return prisma.pyme.update({ where: { id: pyme.id }, data });
};

const remove = async (id, user) => {
  const pyme = await prisma.pyme.findUnique({ where: { id: Number(id) } });
  if (!pyme) throw new ApiError(404, 'PYME no encontrada');
  if (!(await canAccess(pyme, user))) throw new ApiError(403, 'No tiene acceso a esta PYME');
  await exigirCapacidad(user, pyme.id, 'gestionarPyme');

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

// --- Miembros (equipo por PYME) ---

const listMiembros = async (pymeId) => {
  return prisma.pyme_membresia.findMany({
    where: { pymeId: Number(pymeId), activo: true },
    include: {
      user: { select: { id: true, nombre: true, email: true } },
      sede: { select: { id: true, nombre: true } },
      rolesExtra: true,
    },
    orderBy: { createdAt: 'asc' },
  });
};

// Invita por email: el usuario debe existir ya (registrado por su cuenta) —
// el OWNER no puede crear cuentas ajenas ni asignarles una clave temporal;
// solo puede dar acceso a alguien que ya tiene credenciales propias.
// `roles` es un array (1 a 3 de ROLES_COMBINABLES) — el primero se guarda en
// `rol`, el resto en `rolesExtra`, así una persona puede ser p. ej. VENDEDOR
// + ANALISTA a la vez.
const inviteMiembro = async (pymeId, invitador, { email, roles, sedeId }) => {
  if (!rolesValidos(roles)) throw new ApiError(400, 'Rol inválido');
  const [rol, ...extra] = roles;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new ApiError(404, 'No existe ninguna cuenta con ese correo. La persona debe registrarse primero.');
  }

  const existente = await prisma.pyme_membresia.findFirst({
    where: { userId: user.id, pymeId: Number(pymeId), sedeId: sedeId ? Number(sedeId) : null },
  });

  if (existente) {
    if (existente.estado !== 'RECHAZADA') {
      throw new ApiError(409, 'Este usuario ya es miembro de la PYME o tiene una invitación pendiente');
    }
    // Rechazó antes: reabrir la misma fila como invitación nueva en vez de
    // acumular filas muertas (el @@unique userId+pymeId+sedeId no lo permitiría).
    const reabierta = await prisma.pyme_membresia.update({
      where: { id: existente.id },
      data: {
        rol,
        estado: 'PENDIENTE',
        invitadoPorId: invitador.id,
        respondidoAt: null,
        decisionVistaPorOwner: true,
        rolesExtra: { deleteMany: {}, create: extra.map((r) => ({ rol: r })) },
      },
      include: { user: { select: { id: true, nombre: true, email: true } }, rolesExtra: true },
    });
    return { membresia: reabierta };
  }

  const membresia = await prisma.pyme_membresia.create({
    data: {
      userId: user.id,
      pymeId: Number(pymeId),
      sedeId: sedeId ? Number(sedeId) : null,
      rol,
      invitadoPorId: invitador.id,
      rolesExtra: { create: extra.map((r) => ({ rol: r })) },
    },
    include: { user: { select: { id: true, nombre: true, email: true } }, rolesExtra: true },
  });

  return { membresia };
};

const updateMiembro = async (pymeId, miembroId, { roles, sedeId }) => {
  const membresia = await prisma.pyme_membresia.findFirst({
    where: { id: Number(miembroId), pymeId: Number(pymeId) },
  });
  if (!membresia) throw new ApiError(404, 'Miembro no encontrado');
  if (roles && !rolesValidos(roles)) throw new ApiError(400, 'Rol inválido');
  const [rol, ...extra] = roles || [];

  return prisma.pyme_membresia.update({
    where: { id: membresia.id },
    data: {
      ...(roles ? { rol, rolesExtra: { deleteMany: {}, create: extra.map((r) => ({ rol: r })) } } : {}),
      ...(sedeId !== undefined ? { sedeId: sedeId ? Number(sedeId) : null } : {}),
    },
    include: { rolesExtra: true },
  });
};

const removeMiembro = async (pymeId, miembroId) => {
  const membresia = await prisma.pyme_membresia.findFirst({
    where: { id: Number(miembroId), pymeId: Number(pymeId) },
  });
  if (!membresia) throw new ApiError(404, 'Miembro no encontrado');
  if (membresia.rol === 'OWNER') throw new ApiError(400, 'No se puede eliminar al OWNER de la PYME');

  await prisma.pyme_membresia.update({ where: { id: membresia.id }, data: { activo: false } });
  return true;
};

// Autoservicio: un miembro invitado abandona la PYME por su cuenta, sin que
// el OWNER tenga que sacarlo desde Equipo. Mismo efecto que removeMiembro
// (activo: false), pero resuelto contra la membresía del propio usuario en
// vez de un miembroId — así "Mis PYMES" no necesita conocer el id interno
// de la membresía, solo el id de la PYME que ya tiene en pantalla.
const leaveMembresia = async (pymeId, user) => {
  const membresia = await prisma.pyme_membresia.findFirst({
    where: { pymeId: Number(pymeId), userId: user.id, activo: true, estado: 'ACEPTADA' },
  });
  if (!membresia) throw new ApiError(404, 'No sos miembro de esta PYME');
  if (membresia.rol === 'OWNER') throw new ApiError(400, 'El dueño no puede abandonar su propia PYME');

  await prisma.pyme_membresia.update({ where: { id: membresia.id }, data: { activo: false } });
  return true;
};

// --- Sedes ---

const listSedes = async (pymeId) => {
  return prisma.sede.findMany({
    where: { pymeId: Number(pymeId) },
    orderBy: { createdAt: 'asc' },
  });
};

const createSede = async (pymeId, data) => {
  return prisma.sede.create({
    data: {
      pymeId: Number(pymeId),
      nombre: data.nombre,
      direccion: data.direccion,
      ciudad: data.ciudad,
    },
  });
};

const updateSede = async (pymeId, sedeId, data) => {
  const sede = await prisma.sede.findFirst({ where: { id: Number(sedeId), pymeId: Number(pymeId) } });
  if (!sede) throw new ApiError(404, 'Sede no encontrada');
  return prisma.sede.update({ where: { id: sede.id }, data });
};

const removeSede = async (pymeId, sedeId) => {
  const sede = await prisma.sede.findFirst({ where: { id: Number(sedeId), pymeId: Number(pymeId) } });
  if (!sede) throw new ApiError(404, 'Sede no encontrada');

  const totalSedes = await prisma.sede.count({ where: { pymeId: Number(pymeId) } });
  if (totalSedes <= 1) throw new ApiError(400, 'No se puede eliminar la única sede de la PYME');

  await prisma.sede.delete({ where: { id: sede.id } });
  return true;
};

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
  listMiembros,
  inviteMiembro,
  updateMiembro,
  removeMiembro,
  leaveMembresia,
  listSedes,
  createSede,
  updateSede,
  removeSede,
};

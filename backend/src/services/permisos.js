const prisma = require('../lib/prisma');
const ApiError = require('../utils/ApiError');

// Matriz rol de pyme_membresia -> qué puede hacer en esa PYME. El ADMIN
// global (user.rol === 'ADMIN') y el dueño histórico (pyme.userId) se
// resuelven a 'OWNER' en rolEnPyme, no viven acá como rol aparte.
const CAPACIDADES = {
  OWNER: {
    gestionarPyme: true,
    gestionarMiembros: true,
    gestionarSedes: true,
    gestionarProductos: true,
    modificarInventario: true,
    crearVentas: true,
    verCostoProducto: true,
    verReportesFinancieros: true,
    verPredicciones: true,
    generarPredicciones: true,
    verDashboard: true,
    verInventario: true,
    verVentas: true,
  },
  // VENDEDOR: su única pantalla operativa es Ventas — sin dashboard (no le
  // aporta nada) ni inventario (ahí solo gestiona/consulta stock, que no es
  // su tarea; vender vive únicamente en Ventas.jsx).
  VENDEDOR: {
    gestionarPyme: false,
    gestionarMiembros: false,
    gestionarSedes: false,
    gestionarProductos: false,
    modificarInventario: false,
    crearVentas: true,
    verCostoProducto: false,
    verReportesFinancieros: false,
    verPredicciones: false,
    generarPredicciones: false,
    verDashboard: false,
    verInventario: false,
    verVentas: true,
  },
  // INVENTARIO ve costo de producto (lo necesita para poder editarlo) pero no
  // reportes financieros agregados (margen bruto, rentabilidad, ingresos),
  // ni dashboard, ventas o predicción — su pantalla es Inventario.
  INVENTARIO: {
    gestionarPyme: false,
    gestionarMiembros: false,
    gestionarSedes: false,
    gestionarProductos: true,
    modificarInventario: true,
    crearVentas: false,
    verCostoProducto: true,
    verReportesFinancieros: false,
    verPredicciones: false,
    generarPredicciones: false,
    verDashboard: false,
    verInventario: true,
    verVentas: false,
  },
  ANALISTA: {
    gestionarPyme: false,
    gestionarMiembros: false,
    gestionarSedes: false,
    gestionarProductos: false,
    modificarInventario: false,
    crearVentas: false,
    verCostoProducto: true,
    verReportesFinancieros: true,
    verPredicciones: true,
    generarPredicciones: false,
    verDashboard: true,
    verInventario: true,
    verVentas: true,
  },
};

// Resuelve el conjunto de roles del usuario en una PYME puntual: ADMIN global
// y dueño histórico siempre son ['OWNER']; si no, [rol, ...rolesExtra] de su
// membresía activa aceptada — un miembro puede tener más de un rol a la vez
// (p. ej. VENDEDOR + ANALISTA); [] si no tiene acceso a esa PYME.
const rolesEnPyme = async (user, pymeId) => {
  if (user.rol === 'ADMIN') return ['OWNER'];
  if (!pymeId) return [];

  const pyme = await prisma.pyme.findUnique({ where: { id: Number(pymeId) } });
  if (!pyme) return [];
  if (pyme.userId === user.id) return ['OWNER'];

  const membresia = await prisma.pyme_membresia.findFirst({
    where: { pymeId: Number(pymeId), userId: user.id, activo: true, estado: 'ACEPTADA' },
    include: { rolesExtra: true },
  });
  if (!membresia) return [];
  return [membresia.rol, ...membresia.rolesExtra.map((r) => r.rol)];
};

const tieneCapacidad = async (user, pymeId, capacidad) => {
  const roles = await rolesEnPyme(user, pymeId);
  return roles.some((rol) => CAPACIDADES[rol]?.[capacidad]);
};

const exigirCapacidad = async (user, pymeId, capacidad) => {
  if (!(await tieneCapacidad(user, pymeId, capacidad))) {
    throw new ApiError(403, 'Tu rol no tiene permiso para esta acción');
  }
};

// IDs de las PYMES (entre las que el usuario ya puede ver por membresía) en
// las que además tiene la capacidad pedida. Para listados sin pymeId fijo
// (vista "todas mis PYMES"), donde no hay una sola PYME contra la cual
// resolver el rol. null = sin restricción (ADMIN global).
const pymeIdsConCapacidad = async (user, capacidad) => {
  if (user.rol === 'ADMIN') return null;

  const [pymesPropias, membresias] = await Promise.all([
    prisma.pyme.findMany({ where: { userId: user.id }, select: { id: true } }),
    prisma.pyme_membresia.findMany({
      where: { userId: user.id, activo: true, estado: 'ACEPTADA' },
      select: { pymeId: true, rol: true, rolesExtra: { select: { rol: true } } },
    }),
  ]);

  const ids = new Set(pymesPropias.map((p) => p.id));
  for (const m of membresias) {
    const roles = [m.rol, ...m.rolesExtra.map((r) => r.rol)];
    if (roles.some((rol) => CAPACIDADES[rol]?.[capacidad])) ids.add(m.pymeId);
  }
  return Array.from(ids);
};

// true solo si el usuario tiene la capacidad en TODAS las PYMES a las que
// tiene acceso (vista agregada "todas mis PYMES" sin pymeId puntual) — así
// no se filtra de más un número de una PYME donde sí tiene permiso, ni se
// muestra de más el de una donde no.
const capacidadEnTodas = async (user, capacidad) => {
  if (user.rol === 'ADMIN') return true;

  const [pymesPropias, membresias] = await Promise.all([
    prisma.pyme.findMany({ where: { userId: user.id }, select: { id: true } }),
    prisma.pyme_membresia.findMany({
      where: { userId: user.id, activo: true, estado: 'ACEPTADA' },
      select: { pymeId: true, rol: true, rolesExtra: { select: { rol: true } } },
    }),
  ]);

  const todas = new Set(pymesPropias.map((p) => p.id));
  const conCapacidad = new Set(pymesPropias.map((p) => p.id)); // dueño siempre OWNER
  for (const m of membresias) {
    todas.add(m.pymeId);
    const roles = [m.rol, ...m.rolesExtra.map((r) => r.rol)];
    if (roles.some((rol) => CAPACIDADES[rol]?.[capacidad])) conCapacidad.add(m.pymeId);
  }

  if (todas.size === 0) return true; // sin PYMES accesibles, nada que ocultar
  return conCapacidad.size === todas.size;
};

// Borra costo/margen de un producto (objeto plano o con relación anidada
// `producto`) cuando el rol no debe verlos. Muta y devuelve el mismo objeto.
const ocultarCosto = (producto) => {
  if (!producto) return producto;
  delete producto.costo;
  delete producto.margen;
  if (producto.producto) ocultarCosto(producto.producto);
  return producto;
};

// Borra costoUnitario (y costo del producto anidado, si viene incluido) de
// una venta cuando el rol no debe ver costos.
const ocultarCostoVenta = (venta) => {
  if (!venta) return venta;
  delete venta.costoUnitario;
  if (venta.producto) ocultarCosto(venta.producto);
  return venta;
};

module.exports = {
  CAPACIDADES,
  rolesEnPyme,
  tieneCapacidad,
  exigirCapacidad,
  pymeIdsConCapacidad,
  capacidadEnTodas,
  ocultarCosto,
  ocultarCostoVenta,
};

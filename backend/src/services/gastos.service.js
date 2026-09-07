const prisma = require('../lib/prisma');
const ApiError = require('../utils/ApiError');
const { accesoWhere, tieneAcceso, resolverSedeId } = require('./acceso.util');
const { exigirCapacidad, pymeIdsConCapacidad } = require('./permisos');
const { resolverRango } = require('../lib/periodo.util');

// Categorías sugeridas de gasto operativo. `categoria` en la BD es string
// libre (igual que producto.categoria): esta lista alimenta el select del
// formulario y valida la ruta, pero "OTRO" admite que el usuario escriba
// una categoría propia en `descripcion`.
const GASTO_CATEGORIAS = [
  'ARRIENDO',
  'NOMINA',
  'SERVICIOS',
  'MERCADERIA',
  'IMPUESTOS',
  'TRANSPORTE',
  'COMISIONES',
  'MANTENIMIENTO',
  'MARKETING',
  'OTRO',
];

// Igual criterio que facturas/predicciones: con pymeId puntual, sin la
// capacidad `verReportesFinancieros` es 403 real; en "todas mis PYMES" se
// filtra a las que sí la dan en vez de tirar error.
// Acepta `desde`/`hasta` explícitos o el atajo `rango` (este-mes, mes-pasado,
// trimestre, anio) — el mismo que entiende el panel de Contabilidad.
const buildWhere = async (user, { pymeId, sedeId, desde, hasta, rango, categoria } = {}) => {
  const sedeIdFinal = await resolverSedeId(pymeId, user, sedeId);
  if (pymeId) await exigirCapacidad(user, pymeId, 'verReportesFinancieros');
  const idsConVista = pymeId ? null : await pymeIdsConCapacidad(user, 'verReportesFinancieros');

  const fechaWhere = desde || hasta || rango
    ? (() => {
        const r = resolverRango({ rango, desde, hasta });
        return { fecha: { gte: r.desde, lte: r.hasta } };
      })()
    : {};

  return {
    ...(await accesoWhere(user)),
    ...(pymeId ? { pymeId: Number(pymeId) } : {}),
    ...(sedeIdFinal ? { sedeId: sedeIdFinal } : {}),
    ...(idsConVista ? { pymeId: { in: idsConVista } } : {}),
    ...(categoria ? { categoria } : {}),
    ...fechaWhere,
  };
};

const list = async (user, filtros = {}) => {
  const where = await buildWhere(user, filtros);
  return prisma.gasto.findMany({
    where,
    include: { registradoPor: { select: { id: true, nombre: true } }, sede: { select: { id: true, nombre: true } } },
    orderBy: { fecha: 'desc' },
  });
};

// Agregado { categoria, total, cantidad }[] descendente por total — lo usan
// el panel de contabilidad y la herramienta del asistente.
const resumenPorCategoria = async (user, filtros = {}) => {
  const where = await buildWhere(user, filtros);
  const filas = await prisma.gasto.groupBy({
    by: ['categoria'],
    where,
    _sum: { monto: true },
    _count: { _all: true },
  });
  return filas
    .map((f) => ({ categoria: f.categoria, total: f._sum.monto || 0, cantidad: f._count._all }))
    .sort((a, b) => b.total - a.total);
};

const total = async (user, filtros = {}) => {
  const where = await buildWhere(user, filtros);
  const agg = await prisma.gasto.aggregate({ where, _sum: { monto: true } });
  return agg._sum.monto || 0;
};

// Resuelve el pymeId + sedeId de escritura respetando la restricción de sede
// de la membresía, igual que productos.service.create.
const resolverDestino = async (user, { pymeId, sedeId }) => {
  const pyme = await prisma.pyme.findUnique({ where: { id: Number(pymeId) } });
  if (!pyme) throw new ApiError(404, 'PYME no encontrada');
  await exigirCapacidad(user, pyme.id, 'gestionarGastos');

  let sedeFinal = sedeId ? Number(sedeId) : null;
  if (user.rol !== 'ADMIN' && pyme.userId !== user.id) {
    const membresia = await prisma.pyme_membresia.findFirst({
      where: { pymeId: pyme.id, userId: user.id, activo: true, estado: 'ACEPTADA' },
    });
    if (!membresia) throw new ApiError(403, 'No tiene acceso a esta PYME');
    if (membresia.sedeId) {
      if (sedeFinal && sedeFinal !== membresia.sedeId) {
        throw new ApiError(403, 'No tiene acceso a esa sede');
      }
      sedeFinal = membresia.sedeId;
    }
  }
  return { pymeId: pyme.id, sedeId: sedeFinal };
};

const normalizarCategoria = (c) => {
  const s = String(c || '').trim().toUpperCase();
  return GASTO_CATEGORIAS.includes(s) ? s : 'OTRO';
};

const create = async (user, data) => {
  const { pymeId, sedeId } = await resolverDestino(user, data);
  const monto = Number(data.monto);
  if (!Number.isFinite(monto) || monto <= 0) throw new ApiError(400, 'El monto debe ser mayor a 0');

  return prisma.gasto.create({
    data: {
      pymeId,
      sedeId,
      categoria: normalizarCategoria(data.categoria),
      descripcion: String(data.descripcion || '').trim() || null,
      monto,
      fecha: data.fecha ? new Date(data.fecha) : new Date(),
      registradoPorId: user.id,
    },
    include: { registradoPor: { select: { id: true, nombre: true } }, sede: { select: { id: true, nombre: true } } },
  });
};

const findOwned = async (id, user) => {
  const gasto = await prisma.gasto.findUnique({ where: { id: Number(id) }, include: { pyme: true } });
  if (!gasto) throw new ApiError(404, 'Gasto no encontrado');
  if (!(await tieneAcceso(gasto, user))) throw new ApiError(403, 'No tiene acceso a este gasto');
  await exigirCapacidad(user, gasto.pymeId, 'gestionarGastos');
  return gasto;
};

const update = async (id, user, data) => {
  const gasto = await findOwned(id, user);
  const patch = {};
  if (data.categoria !== undefined) patch.categoria = normalizarCategoria(data.categoria);
  if (data.descripcion !== undefined) patch.descripcion = String(data.descripcion || '').trim() || null;
  if (data.fecha !== undefined) patch.fecha = new Date(data.fecha);
  if (data.monto !== undefined) {
    const monto = Number(data.monto);
    if (!Number.isFinite(monto) || monto <= 0) throw new ApiError(400, 'El monto debe ser mayor a 0');
    patch.monto = monto;
  }
  if (data.sedeId !== undefined) patch.sedeId = data.sedeId ? Number(data.sedeId) : null;

  return prisma.gasto.update({
    where: { id: gasto.id },
    data: patch,
    include: { registradoPor: { select: { id: true, nombre: true } }, sede: { select: { id: true, nombre: true } } },
  });
};

const remove = async (id, user) => {
  const gasto = await findOwned(id, user);
  await prisma.gasto.delete({ where: { id: gasto.id } });
  return gasto;
};

// Copia los gastos del mes calendario anterior al mes actual (misma
// categoría, monto y descripción; la fecha se desplaza al mismo día del mes
// en curso). Pensado para gastos fijos —arriendo, nómina, servicios— que se
// repiten mes a mes: en vez de modelar recurrencia, un botón.
const duplicarMesAnterior = async (user, data) => {
  const { pymeId, sedeId } = await resolverDestino(user, data);

  const hoy = new Date();
  const inicioMesActual = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const inicioMesAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);

  const [previos, actuales] = await Promise.all([
    prisma.gasto.findMany({
      where: { pymeId, ...(sedeId ? { sedeId } : {}), fecha: { gte: inicioMesAnterior, lt: inicioMesActual } },
    }),
    prisma.gasto.findMany({
      where: { pymeId, ...(sedeId ? { sedeId } : {}), fecha: { gte: inicioMesActual } },
      select: { categoria: true, descripcion: true },
    }),
  ]);
  if (previos.length === 0) {
    throw new ApiError(400, 'No hay gastos el mes pasado para duplicar.');
  }

  // No re-crear un gasto cuya (categoría + descripción) ya existe este mes —
  // así el botón se puede tocar dos veces sin duplicar el arriendo.
  const yaEste = new Set(actuales.map((g) => `${g.categoria}|${g.descripcion || ''}`));
  const finMesActual = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  const nuevos = previos
    .filter((g) => !yaEste.has(`${g.categoria}|${g.descripcion || ''}`))
    .map((g) => {
      const dia = Math.min(new Date(g.fecha).getDate(), finMesActual);
      return {
        pymeId,
        sedeId: g.sedeId,
        categoria: g.categoria,
        descripcion: g.descripcion,
        monto: g.monto,
        fecha: new Date(hoy.getFullYear(), hoy.getMonth(), dia),
        registradoPorId: user.id,
      };
    });

  if (nuevos.length === 0) {
    throw new ApiError(400, 'Los gastos del mes pasado ya están cargados este mes.');
  }

  await prisma.gasto.createMany({ data: nuevos });
  return { creados: nuevos.length };
};

module.exports = {
  GASTO_CATEGORIAS,
  list,
  resumenPorCategoria,
  total,
  create,
  update,
  remove,
  duplicarMesAnterior,
};

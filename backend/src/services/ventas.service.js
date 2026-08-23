const prisma = require('../lib/prisma');
const ApiError = require('../utils/ApiError');
const inventarioService = require('./inventario.service');
const prediccionesService = require('./predicciones.service');
const iaSync = require('../lib/iaSync');
const { accesoCondiciones, tieneAcceso, resolverSedeId } = require('./acceso.util');

const list = async (user, { pymeId, sedeId, desde, hasta } = {}) => {
  const sedeIdFinal = await resolverSedeId(pymeId, user, sedeId);

  const where = {
    OR: await accesoCondiciones(user),
    ...(pymeId ? { pymeId: Number(pymeId) } : {}),
    ...(sedeIdFinal ? { sedeId: sedeIdFinal } : {}),
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
  if (!(await tieneAcceso(producto, user))) {
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
        sedeId: producto.sedeId,
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

/**
 * Ranking de productos por unidades vendidas. Base compartida por masVendido
 * (orden DESC, "mas vendido") y menosVendido (orden ASC, "menos vendido") —
 * misma agregacion real contra la tabla venta, cada una es una operacion
 * explicita propia, no una inversion del formatter de la otra.
 *
 * Alcance: solo productos con al menos una venta registrada en el periodo
 * (igual que masVendido ya hacia). "Menos vendido" se interpreta como "el que
 * menos vendio de los que vendieron algo", no incluye productos sin ventas —
 * esa seria una pregunta distinta (inventario sin movimiento).
 */
const rankingVentas = async (user, { pymeId, sedeId, categoria, dias, orden = 'DESC' } = {}) => {
  const sedeIdFinal = await resolverSedeId(pymeId, user, sedeId);
  const desde = dias ? new Date(Date.now() - dias * 24 * 60 * 60 * 1000) : null;

  const ventas = await prisma.venta.findMany({
    where: {
      OR: await accesoCondiciones(user),
      ...(pymeId ? { pymeId: Number(pymeId) } : {}),
      ...(sedeIdFinal ? { sedeId: sedeIdFinal } : {}),
      ...(desde ? { fecha: { gte: desde } } : {}),
      ...(categoria ? { producto: { categoria } } : {}),
    },
    select: { productoId: true, cantidad: true, total: true, producto: { select: { id: true, nombre: true, categoria: true } } },
  });

  const porProducto = new Map();
  for (const v of ventas) {
    const entry = porProducto.get(v.productoId) || {
      id: v.producto.id,
      nombre: v.producto.nombre,
      categoria: v.producto.categoria,
      unidades: 0,
      ingresos: 0,
    };
    entry.unidades += v.cantidad;
    entry.ingresos += v.total;
    porProducto.set(v.productoId, entry);
  }

  const ranking = Array.from(porProducto.values());
  return orden === 'ASC'
    ? ranking.sort((a, b) => a.unidades - b.unidades)
    : ranking.sort((a, b) => b.unidades - a.unidades);
};

const masVendido = (user, opts = {}) => rankingVentas(user, { ...opts, orden: 'DESC' });
const menosVendido = (user, opts = {}) => rankingVentas(user, { ...opts, orden: 'ASC' });

/**
 * Ranking de productos por RENTABILIDAD real (margen = (precioUnitario -
 * costoUnitario) * cantidad, sumado sobre las ventas del periodo). Eje
 * distinto al de unidades vendidas (rankingVentas) — un producto puede
 * vender pocas unidades y ser el mas rentable, o vender mucho con margen
 * bajo. Usa datos reales de la tabla venta, no la prediccion del motor de IA
 * (eso es otro dato, calculado por predicciones.service para otro proposito).
 */
const rankingRentabilidad = async (user, { pymeId, sedeId, categoria, dias, orden = 'DESC' } = {}) => {
  const sedeIdFinal = await resolverSedeId(pymeId, user, sedeId);
  const desde = dias ? new Date(Date.now() - dias * 24 * 60 * 60 * 1000) : null;

  const ventas = await prisma.venta.findMany({
    where: {
      OR: await accesoCondiciones(user),
      ...(pymeId ? { pymeId: Number(pymeId) } : {}),
      ...(sedeIdFinal ? { sedeId: sedeIdFinal } : {}),
      ...(desde ? { fecha: { gte: desde } } : {}),
      ...(categoria ? { producto: { categoria } } : {}),
    },
    select: {
      productoId: true,
      cantidad: true,
      total: true,
      precioUnitario: true,
      costoUnitario: true,
      producto: { select: { id: true, nombre: true, categoria: true } },
    },
  });

  const porProducto = new Map();
  for (const v of ventas) {
    const entry = porProducto.get(v.productoId) || {
      id: v.producto.id,
      nombre: v.producto.nombre,
      categoria: v.producto.categoria,
      unidades: 0,
      ingresos: 0,
      margen: 0,
    };
    entry.unidades += v.cantidad;
    entry.ingresos += v.total;
    entry.margen += (v.precioUnitario - v.costoUnitario) * v.cantidad;
    porProducto.set(v.productoId, entry);
  }

  const ranking = Array.from(porProducto.values()).map((p) => ({
    ...p,
    margenPorcentual: p.ingresos > 0 ? Number(((p.margen / p.ingresos) * 100).toFixed(1)) : 0,
  }));

  return orden === 'ASC'
    ? ranking.sort((a, b) => a.margen - b.margen)
    : ranking.sort((a, b) => b.margen - a.margen);
};

const masRentable = (user, opts = {}) => rankingRentabilidad(user, { ...opts, orden: 'DESC' });
const menosRentable = (user, opts = {}) => rankingRentabilidad(user, { ...opts, orden: 'ASC' });

// Comparativa entre sedes de una misma PYME: cuál vende más, y qué día de la
// semana mueve más unidades — la pregunta que motivó agregar sedes.
const comparativaSedes = async (user, { pymeId, dias } = {}) => {
  if (!pymeId) throw new ApiError(400, 'pymeId es obligatorio para comparar sedes');
  const desde = dias ? new Date(Date.now() - dias * 24 * 60 * 60 * 1000) : null;

  const ventas = await prisma.venta.findMany({
    where: {
      OR: await accesoCondiciones(user),
      pymeId: Number(pymeId),
      ...(desde ? { fecha: { gte: desde } } : {}),
    },
    select: { sedeId: true, cantidad: true, total: true, fecha: true },
  });

  const sedes = await prisma.sede.findMany({ where: { pymeId: Number(pymeId) } });
  const nombrePorSede = new Map(sedes.map((s) => [s.id, s.nombre]));

  const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const porSede = new Map();
  for (const v of ventas) {
    const key = v.sedeId ?? 'sin-sede';
    const entry = porSede.get(key) || {
      sedeId: v.sedeId,
      nombre: v.sedeId ? nombrePorSede.get(v.sedeId) || `Sede ${v.sedeId}` : 'Sin sede asignada',
      unidades: 0,
      ingresos: 0,
      porDiaSemana: Array.from({ length: 7 }, (_, i) => ({ dia: DIAS[i], unidades: 0 })),
    };
    entry.unidades += v.cantidad;
    entry.ingresos += v.total;
    entry.porDiaSemana[v.fecha.getDay()].unidades += v.cantidad;
    porSede.set(key, entry);
  }

  return Array.from(porSede.values()).sort((a, b) => b.ingresos - a.ingresos);
};

module.exports = {
  list,
  create,
  historialProducto,
  masVendido,
  menosVendido,
  masRentable,
  menosRentable,
  comparativaSedes,
};

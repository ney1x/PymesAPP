const prisma = require('../lib/prisma');
const ApiError = require('../utils/ApiError');
const prediccionesService = require('./predicciones.service');
const iaSync = require('../lib/iaSync');
const { accesoWhere, tieneAcceso, resolverSedeId } = require('./acceso.util');
const { exigirCapacidad, tieneCapacidad, pymeIdsConCapacidad, ocultarCostoVenta } = require('./permisos');

const ocultarCostoFactura = (factura) => ({ ...factura, ventas: factura.ventas.map((v) => ocultarCostoVenta(v)) });

const list = async (user, { pymeId, sedeId, desde, hasta } = {}) => {
  const sedeIdFinal = await resolverSedeId(pymeId, user, sedeId);

  // Mismo criterio que predicciones.service.js: con pymeId puntual, sin la
  // capacidad es 403 (bloquea de verdad, no solo esconde el link de nav);
  // en "todas mis pymes" se filtra a las que sí la dan, en vez de tirar
  // error — así el historial agregado no se cae por una sola PYME sin permiso.
  if (pymeId) await exigirCapacidad(user, pymeId, 'verVentas');
  const idsConVista = pymeId ? null : await pymeIdsConCapacidad(user, 'verVentas');

  const where = {
    ...(await accesoWhere(user)),
    ...(pymeId ? { pymeId: Number(pymeId) } : {}),
    ...(sedeIdFinal ? { sedeId: sedeIdFinal } : {}),
    ...(idsConVista ? { pymeId: { in: idsConVista } } : {}),
    ...(desde || hasta
      ? {
          fecha: {
            ...(desde ? { gte: new Date(desde) } : {}),
            ...(hasta ? { lte: new Date(hasta) } : {}),
          },
        }
      : {}),
  };

  const facturas = await prisma.factura.findMany({
    where,
    include: { ventas: { include: { producto: true } } },
    orderBy: { fecha: 'desc' },
  });

  if (pymeId) {
    if (await tieneCapacidad(user, pymeId, 'verCostoProducto')) return facturas;
    return facturas.map(ocultarCostoFactura);
  }

  const idsConCosto = await pymeIdsConCapacidad(user, 'verCostoProducto');
  if (idsConCosto === null) return facturas; // ADMIN global
  const permitidos = new Set(idsConCosto);
  return facturas.map((f) => (permitidos.has(f.pymeId) ? f : ocultarCostoFactura(f)));
};

// Toda venta pertenece a una factura, incluso una de un solo producto — el
// carrito de Ventas.jsx, el botón rápido "Vender" de Inventario.jsx (vía
// ventasService.create, que delega acá) y el asistente de IA terminan todos
// en esta misma función. Una sola transacción: si algo falla a mitad de
// camino, no queda ninguna línea suelta sin su factura.
const create = async (user, { pymeId, sedeId, lineas, montoRecibido }) => {
  if (!Array.isArray(lineas) || lineas.length === 0) {
    throw new ApiError(400, 'La factura necesita al menos una línea');
  }

  const lineasResueltas = [];
  for (const linea of lineas) {
    const producto = await prisma.producto.findUnique({
      where: { id: Number(linea.productoId) },
      include: { pyme: true },
    });
    if (!producto) throw new ApiError(404, `Producto no encontrado: ${linea.productoId}`);
    if (!(await tieneAcceso(producto, user))) {
      throw new ApiError(403, 'No tiene acceso a este producto');
    }

    const cantidad = Number(linea.cantidad);
    const inventario = await prisma.inventario.findUnique({ where: { productoId: producto.id } });
    if (inventario && cantidad > inventario.stockActual) {
      throw new ApiError(400, `Stock insuficiente de "${producto.nombre}": quedan ${inventario.stockActual} unidades`);
    }

    lineasResueltas.push({ producto, cantidad, precioUnitario: Number(linea.precioUnitario) });
  }

  const pymeIdReal = pymeId ? Number(pymeId) : lineasResueltas[0].producto.pymeId;
  if (lineasResueltas.some((l) => l.producto.pymeId !== pymeIdReal)) {
    throw new ApiError(400, 'Todos los productos de una factura deben pertenecer a la misma PYME');
  }
  const sedeIdReal = sedeId ? Number(sedeId) : lineasResueltas[0].producto.sedeId ?? null;

  await exigirCapacidad(user, pymeIdReal, 'crearVentas');

  const total = lineasResueltas.reduce((sum, l) => sum + l.precioUnitario * l.cantidad, 0);

  const facturaId = await prisma.$transaction(async (tx) => {
    const creada = await tx.factura.create({
      data: {
        pymeId: pymeIdReal,
        sedeId: sedeIdReal,
        total,
        montoRecibido: montoRecibido !== undefined && montoRecibido !== null && montoRecibido !== '' ? Number(montoRecibido) : null,
      },
    });

    for (const l of lineasResueltas) {
      await tx.venta.create({
        data: {
          facturaId: creada.id,
          pymeId: pymeIdReal,
          sedeId: l.producto.sedeId,
          productoId: l.producto.id,
          cantidad: l.cantidad,
          precioUnitario: l.precioUnitario,
          costoUnitario: l.producto.costo,
          total: l.precioUnitario * l.cantidad,
        },
      });
      await tx.inventario.updateMany({
        where: { productoId: l.producto.id },
        data: { stockActual: { decrement: l.cantidad } },
      });
    }

    return creada.id;
  });

  const factura = await prisma.factura.findUnique({
    where: { id: facturaId },
    include: { ventas: { include: { producto: true } } },
  });

  // Espejo hacia el motor de IA + disparo de predicción, por línea. Best
  // effort fuera de la transacción — no debe impedir ni revertir la venta
  // ya registrada si algo de esto falla.
  for (const l of lineasResueltas) {
    try {
      const sede = l.producto.sedeId ? await prisma.sede.findUnique({ where: { id: l.producto.sedeId } }) : null;
      await iaSync.syncVenta({
        producto: l.producto,
        pyme: l.producto.pyme,
        sede,
        cantidad: l.cantidad,
        precioUnitario: l.precioUnitario,
        fecha: factura.fecha,
      });
    } catch (err) {
      console.error('[iaSync]', err.message);
    }

    prediccionesService
      .generarParaProductoInterno(user, l.producto.id)
      .catch((err) => console.error('[prediccion]', err.message));
  }

  return (await tieneCapacidad(user, pymeIdReal, 'verCostoProducto')) ? factura : ocultarCostoFactura(factura);
};

module.exports = { list, create };

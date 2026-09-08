const prisma = require('../lib/prisma');
const ApiError = require('../utils/ApiError');
const prediccionesService = require('./predicciones.service');
const iaSync = require('../lib/iaSync');
const { accesoWhere, tieneAcceso, resolverSedeId } = require('./acceso.util');
const { exigirCapacidad, tieneCapacidad, pymeIdsConCapacidad, ocultarCostoVenta } = require('./permisos');
const {
  esUnidadGranel,
  dimensionDe,
  factorBase,
  formatDesdeBase,
  REDONDEO_GRANEL,
} = require('../lib/unidades.util');

const ocultarCostoFactura = (factura) => ({ ...factura, ventas: factura.ventas.map((v) => ocultarCostoVenta(v)) });

// Resuelve una línea de carrito según su presentación (UNIDAD | CAJA |
// GRANEL). El stock, el ranking de unidades y el espejo al motor de IA
// siempre razonan en UNIDAD BASE (`unidadesBase`); el ticket conserva lo que
// pidió el cliente con su propio precio. `total` es lo efectivamente cobrado
// por la línea (para GRANEL por importe no es `precioUnitario * cantidad`).
// Un producto sin `unidadesPorCaja` (>=2) solo admite UNIDAD.
const FACTOR_CAJA_MINIMO = 2;

// GRANEL: `linea.granel = { modo: 'MEDIDA' | 'IMPORTE', valor, unidad }`.
//  - MEDIDA: `valor` es peso/volumen en `unidad` (o en `producto.unidadVenta`
//    si no se manda / no es compatible). El total se redondea a $50.
//  - IMPORTE: `valor` son pesos; se cobra exacto y se deriva la cantidad.
// `cantidad` sale ya en unidad base (g/ml) y `factorPresentacion` = 1.
const resolverLineaGranel = (producto, linea) => {
  const g = linea.granel || {};
  const modo = g.modo === 'IMPORTE' ? 'IMPORTE' : 'MEDIDA';
  const valor = Number(g.valor);
  if (!Number.isFinite(valor) || valor <= 0) {
    throw new ApiError(400, `Cantidad inválida para "${producto.nombre}"`);
  }

  const factorProducto = factorBase(producto.unidadVenta); // g/ml por unidadVenta
  const precioUnitario = producto.precioVenta / factorProducto; // $ por g/ml
  const costoUnitario = producto.costo / factorProducto;

  let base; // g/ml, entero
  let total; // $ a cobrar
  if (modo === 'IMPORTE') {
    total = Math.round(valor);
    base = Math.max(1, Math.round(valor / precioUnitario));
  } else {
    // El cajero puede teclear en otra unidad de la misma dimensión que la
    // del producto (producto por kg, teclea onzas).
    const unidadEntrada =
      esUnidadGranel(g.unidad) && dimensionDe(g.unidad) === dimensionDe(producto.unidadVenta)
        ? g.unidad
        : producto.unidadVenta;
    base = Math.max(1, Math.round(valor * factorBase(unidadEntrada)));
    total = Math.round((base * precioUnitario) / REDONDEO_GRANEL) * REDONDEO_GRANEL;
  }

  return {
    cantidad: base,
    presentacion: 'GRANEL',
    factor: 1,
    unidadesBase: base,
    precioUnitario,
    costoUnitario,
    total,
  };
};

const resolverLineaPresentacion = (producto, linea) => {
  if (producto.granel && esUnidadGranel(producto.unidadVenta)) {
    return resolverLineaGranel(producto, linea);
  }

  const cantidad = Number(linea.cantidad);
  if (!Number.isFinite(cantidad) || cantidad < 1) {
    throw new ApiError(400, `Cantidad inválida para "${producto.nombre}"`);
  }
  const factorCaja =
    Number(producto.unidadesPorCaja) >= FACTOR_CAJA_MINIMO ? Number(producto.unidadesPorCaja) : null;
  const esCaja = linea.presentacion === 'CAJA' && !!factorCaja;

  const presentacion = esCaja ? 'CAJA' : 'UNIDAD';
  const factor = esCaja ? factorCaja : 1;
  const unidadesBase = cantidad * factor;

  const precioDefault = esCaja
    ? producto.precioCaja ?? producto.precioVenta * factor
    : producto.precioVenta;
  const precioUnitario =
    linea.precioUnitario !== undefined && linea.precioUnitario !== null && linea.precioUnitario !== ''
      ? Number(linea.precioUnitario)
      : Number(precioDefault);

  const costoUnitario = esCaja ? producto.costoCaja ?? producto.costo * factor : producto.costo;

  return {
    cantidad,
    presentacion,
    factor,
    unidadesBase,
    precioUnitario,
    costoUnitario,
    total: precioUnitario * cantidad,
  };
};

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
  // Unidades base ya comprometidas por producto en ESTA factura: dos líneas
  // del mismo producto (p. ej. 1 caja + 5 sueltas) se validan contra el stock
  // de forma acumulada, no cada una por su lado.
  const baseComprometida = new Map();
  for (const linea of lineas) {
    const producto = await prisma.producto.findUnique({
      where: { id: Number(linea.productoId) },
      include: { pyme: true },
    });
    if (!producto) throw new ApiError(404, `Producto no encontrado: ${linea.productoId}`);
    if (!(await tieneAcceso(producto, user))) {
      throw new ApiError(403, 'No tiene acceso a este producto');
    }

    const resuelta = resolverLineaPresentacion(producto, linea);
    const yaComprometido = baseComprometida.get(producto.id) || 0;
    const inventario = await prisma.inventario.findUnique({ where: { productoId: producto.id } });
    if (inventario && yaComprometido + resuelta.unidadesBase > inventario.stockActual) {
      const disp = inventario.stockActual - yaComprometido;
      let detalle;
      if (resuelta.presentacion === 'CAJA') {
        detalle = `${disp} unidades (${Math.floor(disp / resuelta.factor)} cajas de ${resuelta.factor})`;
      } else if (resuelta.presentacion === 'GRANEL') {
        detalle = formatDesdeBase(disp, producto.unidadVenta);
      } else {
        detalle = `${disp} unidades`;
      }
      throw new ApiError(400, `Stock insuficiente de "${producto.nombre}": quedan ${detalle}`);
    }
    baseComprometida.set(producto.id, yaComprometido + resuelta.unidadesBase);

    lineasResueltas.push({ producto, ...resuelta });
  }

  const pymeIdReal = pymeId ? Number(pymeId) : lineasResueltas[0].producto.pymeId;
  if (lineasResueltas.some((l) => l.producto.pymeId !== pymeIdReal)) {
    throw new ApiError(400, 'Todos los productos de una factura deben pertenecer a la misma PYME');
  }
  const sedeIdReal = sedeId ? Number(sedeId) : lineasResueltas[0].producto.sedeId ?? null;

  await exigirCapacidad(user, pymeIdReal, 'crearVentas');

  const total = lineasResueltas.reduce((sum, l) => sum + l.total, 0);

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
          presentacion: l.presentacion,
          factorPresentacion: l.factor,
          precioUnitario: l.precioUnitario,
          costoUnitario: l.costoUnitario,
          total: l.total,
        },
      });
      await tx.inventario.updateMany({
        where: { productoId: l.producto.id },
        data: { stockActual: { decrement: l.unidadesBase } },
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
        // El motor de IA razona en unidad base: 1 caja de 40 = 40 unidades,
        // a precio por unidad (precio de caja / factor).
        cantidad: l.unidadesBase,
        precioUnitario: Math.round((l.precioUnitario / l.factor) * 100) / 100,
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

module.exports = { list, create, resolverLineaPresentacion };

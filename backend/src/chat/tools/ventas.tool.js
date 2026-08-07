const ventasService = require('../../services/ventas.service');
const inventarioService = require('../../services/inventario.service');
const productosService = require('../../services/productos.service');

async function registrarVenta({ user, productoId, cantidad, precioUnitario, pymeId }) {
  const venta = await ventasService.create(user, {
    productoId: Number(productoId),
    pymeId: pymeId ? Number(pymeId) : undefined,
    cantidad: Number(cantidad),
    precioUnitario: Number(precioUnitario),
  });

  return {
    success: true,
    data: {
      id: venta.id,
      fecha: venta.fecha,
      cantidad: venta.cantidad,
      precioUnitario: venta.precioUnitario,
      total: venta.total,
      productoId: venta.productoId,
    },
  };
}

async function historialVentas({ user, productoId, dias = 30 }) {
  const ventas = await ventasService.historialProducto(Number(productoId), dias);
  const total = ventas.reduce((sum, v) => sum + v.cantidad, 0);

  return {
    success: true,
    data: {
      periodoDias: dias,
      totalVendido: total,
      promedioDiario: Number((total / dias).toFixed(1)),
      detalle: ventas.map((v) => ({ fecha: v.fecha, cantidad: v.cantidad, total: v.total })),
    },
  };
}

async function buscarProductoParaVenta({ user, producto, pymeId }) {
  const productos = await productosService.list(user, { pymeId, search: producto });
  if (productos.length === 0) {
    return { success: false, mensaje: `No encontré el producto "${producto}"` };
  }
  return {
    success: true,
    data: productos.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      codigo: p.codigo,
      precioVenta: p.precioVenta,
      stockActual: p.inventario?.stockActual ?? 0,
    })),
  };
}

module.exports = { registrarVenta, historialVentas, buscarProductoParaVenta };
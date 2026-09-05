const productosService = require('../../services/productos.service');
const inventarioService = require('../../services/inventario.service');

async function registrarProducto({ user, nombre, codigo, categoria, precioVenta, costo, stockActual, stockMinimo, pymeId }) {
  const producto = await productosService.create(user, {
    pymeId: Number(pymeId),
    nombre,
    codigo,
    categoria,
    precioVenta: Number(precioVenta),
    costo: Number(costo),
    inventario: {
      stockActual: Number(stockActual ?? 0),
      stockMinimo: Number(stockMinimo ?? 5),
    },
  });

  return {
    success: true,
    data: {
      id: producto.id,
      nombre: producto.nombre,
      codigo: producto.codigo,
      categoria: producto.categoria,
      precioVenta: producto.precioVenta,
      costo: producto.costo,
      margen: producto.margen,
      stockActual: producto.inventario?.stockActual ?? 0,
    },
  };
}

async function consultarProducto({ user, producto, pymeId }) {
  const productos = await productosService.list(user, { pymeId, search: producto });
  if (productos.length === 0) {
    return { success: false, mensaje: `No encontré el producto "${producto}"` };
  }

  return {
    success: true,
    data: productos.map((p) => {
      const upc = Number(p.unidadesPorCaja) >= 2 ? Number(p.unidadesPorCaja) : null;
      const stock = p.inventario?.stockActual ?? 0;
      return {
        id: p.id,
        nombre: p.nombre,
        codigo: p.codigo,
        descripcion: p.descripcion,
        precioVenta: p.precioVenta,
        costo: p.costo,
        margen: p.precioVenta - p.costo,
        categoria: p.categoria?.nombre,
        proveedor: p.proveedor?.nombre,
        stockActual: stock,
        stockMinimo: p.inventario?.stockMinimo ?? 0,
        stockMaximo: p.inventario?.stockMaximo ?? null,
        ubicacion: p.inventario?.ubicacion,
        pyme: p.pyme?.nombre,
        ...(upc
          ? {
              unidadesPorCaja: upc,
              codigoCaja: p.codigoCaja,
              precioCaja: p.precioCaja,
              stockEnCajas: `${Math.floor(stock / upc)} cajas + ${stock % upc} sueltas`,
            }
          : {}),
      };
    }),
  };
}

async function listarProductos({ user, pymeId }) {
  const productos = await productosService.list(user, { pymeId });

  return {
    success: true,
    data: productos.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      codigo: p.codigo,
      precioVenta: p.precioVenta,
      costo: p.costo,
      margen: p.precioVenta - p.costo,
      stockActual: p.inventario?.stockActual ?? 0,
      stockMinimo: p.inventario?.stockMinimo ?? 0,
      alerta: (p.inventario?.stockActual ?? 0) <= (p.inventario?.stockMinimo ?? 0),
    })),
  };
}

module.exports = { registrarProducto, consultarProducto, listarProductos };
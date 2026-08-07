const inventarioService = require('../../services/inventario.service');

async function consultarStock({ user, producto, pymeId }) {
  const inventarios = await inventarioService.list(user, { pymeId });
  const matches = inventarios.filter((inv) =>
    inv.producto.nombre.toLowerCase().includes(producto.toLowerCase())
  );

  if (matches.length === 0) {
    return { success: false, mensaje: `No encontré productos que coincidan con "${producto}"` };
  }

  return {
    success: true,
    data: matches.map((m) => ({
      producto: m.producto.nombre,
      stockActual: m.stockActual,
      stockMinimo: m.stockMinimo,
      stockMaximo: m.stockMaximo,
      ubicacion: m.ubicacion,
      alerta: m.alerta,
      pyme: m.producto.pyme.nombre,
    })),
  };
}

async function alertasStock({ user, pymeId }) {
  const inventarios = await inventarioService.list(user, { alertas: 'true', pymeId });

  if (inventarios.length === 0) {
    return { success: true, data: [], mensaje: 'No hay productos con stock bajo. ¡Todo bien!' };
  }

  return {
    success: true,
    data: inventarios.map((inv) => ({
      producto: inv.producto.nombre,
      stockActual: inv.stockActual,
      stockMinimo: inv.stockMinimo,
      deficit: inv.stockMinimo - inv.stockActual,
      pyme: inv.producto.pyme.nombre,
    })),
  };
}

module.exports = { consultarStock, alertasStock };
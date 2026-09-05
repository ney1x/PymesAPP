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
    data: matches.map((m) => {
      const upc = Number(m.producto.unidadesPorCaja) >= 2 ? Number(m.producto.unidadesPorCaja) : null;
      return {
        producto: m.producto.nombre,
        stockActual: m.stockActual,
        stockMinimo: m.stockMinimo,
        stockMaximo: m.stockMaximo,
        ubicacion: m.ubicacion,
        alerta: m.alerta,
        pyme: m.producto.pyme.nombre,
        // El stock es uno solo, en unidad base. Si el producto se maneja por
        // caja, se agrega el equivalente para responder "cuántas cajas tengo".
        ...(upc
          ? {
              unidadesPorCaja: upc,
              equivaleA: `${Math.floor(m.stockActual / upc)} cajas de ${upc} + ${m.stockActual % upc} sueltas`,
            }
          : {}),
      };
    }),
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
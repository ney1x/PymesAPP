const prediccionesService = require('../../services/predicciones.service');
const inventarioService = require('../../services/inventario.service');

async function generarPrediccion({ user, producto, dias = 7, pymeId }) {
  const inventarios = await inventarioService.list(user, { pymeId });
  const match = inventarios.find((inv) =>
    inv.producto.nombre.toLowerCase().includes(producto.toLowerCase())
  );

  if (!match) {
    return { success: false, mensaje: `No encontré el producto "${producto}"` };
  }

  const prediccion = await prediccionesService.predecir(match.productoId, match.producto.pymeId, dias);

  return {
    success: true,
    data: {
      producto: match.producto.nombre,
      productoId: match.productoId,
      horizonteDias: dias,
      demandaPredicha: prediccion.demandaPredicha,
      nivelConfianza: prediccion.nivelConfianza,
      metodo: prediccion.metodo,
      stockActual: match.stockActual,
      diasCobertura:
        match.stockActual > 0
          ? Math.floor(match.stockActual / (prediccion.demandaPredicha / dias))
          : 0,
    },
  };
}

async function generarPrediccionPorId({ user, productoId, dias = 7 }) {
  const prediccion = await prediccionesService.generarParaProducto(user, Number(productoId), dias);

  return {
    success: true,
    data: {
      producto: prediccion.producto.nombre,
      productoId: prediccion.producto.id,
      horizonteDias: prediccion.horizonteDias,
      demandaPredicha: prediccion.demandaPredicha,
      nivelConfianza: prediccion.nivelConfianza,
      metodo: prediccion.metodo,
      stockActual: prediccion.producto.stockActual,
      rentabilidadPredicha: prediccion.rentabilidadPredicha,
    },
  };
}

module.exports = { generarPrediccion, generarPrediccionPorId };
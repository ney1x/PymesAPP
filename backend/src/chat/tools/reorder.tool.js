const reordenService = require('../../services/reorden.service');

async function sugerirReorden({ user, pymeId, diasForecast = 30 }) {
  const sugerencias = await reordenService.listar(user, { pymeId, diasForecast });

  if (sugerencias.length === 0) {
    return { success: true, data: [], mensaje: 'No hay sugerencias de reorden en este momento.' };
  }

  return {
    success: true,
    data: sugerencias.map((s) => ({
      producto: s.producto.nombre,
      codigo: s.producto.codigo,
      stockActual: s.stockActual,
      stockMinimo: s.stockMinimo,
      puntoReorden: s.puntoReorden,
      stockObjetivo: s.stockObjetivo,
      cantidadSugerida: s.cantidad,
      demandaDiaria: s.demandaDiaria,
      leadTimeDias: s.leadTimeDias,
      proveedor: s.producto.proveedor?.nombre || 'Sin proveedor',
      metodo: s.metodo,
    })),
  };
}

module.exports = { sugerirReorden };
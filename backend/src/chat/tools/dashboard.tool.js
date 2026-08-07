const dashboardService = require('../../services/dashboard.service');

async function resumenDashboard({ user, pymeId }) {
  const dashboard = await dashboardService.get(user, { pymeId });

  return {
    success: true,
    data: {
      resumen: dashboard.resumen,
      ventasUltimos7Dias: dashboard.ventasPorDia,
      topProductos: dashboard.topProductos.map((p) => ({
        id: p.id,
        ingresos: p.ingresos,
        unidades: p.unidades,
      })),
      alertasStock: dashboard.productosBajoStock,
      rankingRentabilidad: dashboard.rankingRentabilidad.slice(0, 10),
    },
  };
}

module.exports = { resumenDashboard };
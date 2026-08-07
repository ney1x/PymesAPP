const inventarioTools = require('./inventario.tool');
const ventasTools = require('./ventas.tool');
const productosTools = require('./productos.tool');
const prediccionesTools = require('./predicciones.tool');
const reorderTools = require('./reorder.tool');
const dashboardTools = require('./dashboard.tool');

module.exports = {
  ...inventarioTools,
  ...ventasTools,
  ...productosTools,
  ...prediccionesTools,
  ...reorderTools,
  ...dashboardTools,
};
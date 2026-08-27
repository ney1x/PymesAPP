const { Router } = require('express');
const authRoutes = require('./auth.routes');
const pymesRoutes = require('./pymes.routes');
const productosRoutes = require('./productos.routes');
const inventarioRoutes = require('./inventario.routes');
const ventasRoutes = require('./ventas.routes');
const facturasRoutes = require('./facturas.routes');
const prediccionesRoutes = require('./predicciones.routes');
const dashboardRoutes = require('./dashboard.routes');
const reordenRoutes = require('./reorden.routes');
const invitacionesRoutes = require('./invitaciones.routes');
const mensajesRoutes = require('./mensajes.routes');
const notificacionesRoutes = require('./notificaciones.routes');
const chatRoutes = require('../chat/chat.routes');

const router = Router();

router.use('/auth', authRoutes);
router.use('/pymes', pymesRoutes);
router.use('/productos', productosRoutes);
router.use('/inventario', inventarioRoutes);
router.use('/ventas', ventasRoutes);
router.use('/facturas', facturasRoutes);
router.use('/predicciones', prediccionesRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/reorden', reordenRoutes);
router.use('/invitaciones', invitacionesRoutes);
router.use('/mensajes', mensajesRoutes);
router.use('/notificaciones', notificacionesRoutes);
router.use('/chat', chatRoutes);

module.exports = router;

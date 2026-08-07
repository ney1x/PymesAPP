const { Router } = require('express');
const authRoutes = require('./auth.routes');
const pymesRoutes = require('./pymes.routes');
const productosRoutes = require('./productos.routes');
const inventarioRoutes = require('./inventario.routes');
const ventasRoutes = require('./ventas.routes');
const prediccionesRoutes = require('./predicciones.routes');
const dashboardRoutes = require('./dashboard.routes');
const reordenRoutes = require('./reorden.routes');
const chatRoutes = require('../chat/chat.routes');

const router = Router();

router.use('/auth', authRoutes);
router.use('/pymes', pymesRoutes);
router.use('/productos', productosRoutes);
router.use('/inventario', inventarioRoutes);
router.use('/ventas', ventasRoutes);
router.use('/predicciones', prediccionesRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/reorden', reordenRoutes);
router.use('/chat', chatRoutes);

module.exports = router;

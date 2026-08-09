const chatService = require('../services/chat.service');
const asyncHandler = require('../utils/asyncHandler');
const { authenticate } = require('../middlewares/auth.middleware');
const { Router } = require('express');

const router = Router();
router.use(authenticate);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const requestStartedAt = Date.now();
    const { mensaje } = req.body;
    if (!mensaje || typeof mensaje !== 'string') {
      return res.status(400).json({ ok: false, error: 'Mensaje requerido' });
    }

    const respuesta = await chatService.procesarMensaje(req.user, mensaje);
    console.log(`[CHAT] response: ${Date.now() - requestStartedAt}ms`);
    res.json({ ok: true, respuesta });
  })
);

router.delete(
  '/historial',
  asyncHandler(async (req, res) => {
    chatService.limpiarHistorial(req.user.id);
    res.json({ ok: true, mensaje: 'Historial limpiado' });
  })
);

module.exports = router;

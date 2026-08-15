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

    // Si el cliente cierra la conexion (timeout, navegador cerrado, retry
    // del usuario) el backend ya no debe seguir corriendo la llamada a
    // Ollama indefinidamente — se aborta de verdad hasta el fetch.
    // OJO: `req.on('close')` dispara apenas Node termina de LEER el body
    // del request (no cuando el cliente se desconecta) — con eso abortabamos
    // requests que iban perfectamente bien. `res.on('close')` es lo correcto:
    // dispara cuando la respuesta termina de enviarse O cuando la conexion
    // se corta antes de terminar; el flag `respondido` distingue ambos casos.
    const controller = new AbortController();
    let respondido = false;
    res.on('close', () => {
      if (!respondido) controller.abort(new Error('Cliente desconectado'));
    });

    const respuesta = await chatService.procesarMensaje(req.user, mensaje, controller.signal);
    respondido = true;
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

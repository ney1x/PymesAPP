const notificacionesService = require('../services/notificaciones.service');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middlewares/validate.middleware');
const { param } = require('express-validator');
const { authenticate } = require('../middlewares/auth.middleware');
const { Router } = require('express');

const router = Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const resumen = await notificacionesService.resumen(req.user);
    res.json({ ok: true, ...resumen });
  })
);

router.get(
  '/decisiones',
  asyncHandler(async (req, res) => {
    const decisiones = await notificacionesService.decisionesPendientes(req.user);
    res.json({ ok: true, decisiones });
  })
);

router.post(
  '/decisiones/:id/visto',
  validate([param('id').isInt().withMessage('ID inválido')]),
  asyncHandler(async (req, res) => {
    await notificacionesService.descartarDecision(req.params.id, req.user);
    res.json({ ok: true });
  })
);

module.exports = router;

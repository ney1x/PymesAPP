const mensajesService = require('../services/mensajes.service');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middlewares/validate.middleware');
const { param, query } = require('express-validator');
const { authenticate } = require('../middlewares/auth.middleware');
const { Router } = require('express');

const router = Router();
router.use(authenticate);

router.get(
  '/',
  validate([
    query('soloNoLeidos').optional().isIn(['true', 'false']),
    query('prioridad').optional().isIn(['BAJA', 'NORMAL', 'ALTA']).withMessage('Prioridad inválida'),
  ]),
  asyncHandler(async (req, res) => {
    const mensajes = await mensajesService.bandejaEntrada(req.user, req.query);
    res.json({ ok: true, mensajes });
  })
);

router.post(
  '/:id/leido',
  validate([param('id').isInt().withMessage('ID inválido')]),
  asyncHandler(async (req, res) => {
    const mensaje = await mensajesService.marcarLeido(req.params.id, req.user);
    res.json({ ok: true, mensaje });
  })
);

module.exports = router;

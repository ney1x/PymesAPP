const invitacionesService = require('../services/invitaciones.service');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middlewares/validate.middleware');
const { param } = require('express-validator');
const { authenticate } = require('../middlewares/auth.middleware');
const { Router } = require('express');

const router = Router();
router.use(authenticate);

const idParam = validate([param('id').isInt().withMessage('ID inválido')]);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const invitaciones = await invitacionesService.listPendientes(req.user);
    res.json({ ok: true, invitaciones });
  })
);

router.post(
  '/:id/aceptar',
  idParam,
  asyncHandler(async (req, res) => {
    const membresia = await invitacionesService.aceptar(req.params.id, req.user);
    res.json({ ok: true, membresia });
  })
);

router.post(
  '/:id/rechazar',
  idParam,
  asyncHandler(async (req, res) => {
    const membresia = await invitacionesService.rechazar(req.params.id, req.user);
    res.json({ ok: true, membresia });
  })
);

module.exports = router;

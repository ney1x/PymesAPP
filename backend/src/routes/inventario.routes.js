const inventarioService = require('../services/inventario.service');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middlewares/validate.middleware');
const { body, param, query } = require('express-validator');
const { authenticate } = require('../middlewares/auth.middleware');
const { Router } = require('express');

const router = Router();
router.use(authenticate);

router.get(
  '/',
  validate([
    query('alertas').optional().isIn(['true', 'false']),
    query('pymeId').optional().isInt(),
  ]),
  asyncHandler(async (req, res) => {
    const inventarios = await inventarioService.list(req.user, req.query);
    res.json({ ok: true, inventarios });
  })
);

router.put(
  '/:id',
  validate([
    param('id').isInt().withMessage('ID inválido'),
    body('stockActual').optional().isInt({ min: 0 }).withMessage('Stock inválido'),
    body('stockMinimo').optional().isInt({ min: 0 }).withMessage('Stock mínimo inválido'),
    body('stockMaximo').optional().isInt({ min: 0 }).withMessage('Stock máximo inválido'),
    body('ubicacion').optional().isString(),
  ]),
  asyncHandler(async (req, res) => {
    const inventario = await inventarioService.update(req.params.id, req.user, req.body);
    res.json({ ok: true, inventario });
  })
);

module.exports = router;

const contabilidadService = require('../services/contabilidad.service');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middlewares/validate.middleware');
const { query } = require('express-validator');
const { authenticate } = require('../middlewares/auth.middleware');
const { Router } = require('express');

const router = Router();
router.use(authenticate);

router.get(
  '/',
  validate([
    query('pymeId').optional().isInt(),
    query('sedeId').optional().isInt(),
    query('rango').optional().isIn(['este-mes', 'mes-pasado', 'trimestre', 'anio', 'personalizado']),
    query('desde').optional().isISO8601().withMessage('desde debe ser fecha ISO'),
    query('hasta').optional().isISO8601().withMessage('hasta debe ser fecha ISO'),
  ]),
  asyncHandler(async (req, res) => {
    const data = await contabilidadService.get(req.user, req.query);
    res.json({ ok: true, data });
  })
);

module.exports = router;

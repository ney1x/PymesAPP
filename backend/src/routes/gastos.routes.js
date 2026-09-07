const gastosService = require('../services/gastos.service');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middlewares/validate.middleware');
const { body, param, query } = require('express-validator');
const { authenticate } = require('../middlewares/auth.middleware');
const { Router } = require('express');

const router = Router();
router.use(authenticate);

const idParam = validate([param('id').isInt().withMessage('ID inválido')]);

const gastoBody = validate([
  body('pymeId').isInt().withMessage('pymeId es obligatorio'),
  body('sedeId').optional({ nullable: true }).isInt().withMessage('sedeId inválido'),
  body('categoria').isString().notEmpty().withMessage('La categoría es obligatoria'),
  body('descripcion').optional({ nullable: true }).isString(),
  body('monto').isFloat({ gt: 0 }).withMessage('El monto debe ser mayor a 0'),
  body('fecha').optional().isISO8601().withMessage('fecha debe ser fecha ISO'),
]);

const gastoPatch = validate([
  param('id').isInt().withMessage('ID inválido'),
  body('categoria').optional().isString().notEmpty(),
  body('descripcion').optional({ nullable: true }).isString(),
  body('monto').optional().isFloat({ gt: 0 }).withMessage('El monto debe ser mayor a 0'),
  body('fecha').optional().isISO8601().withMessage('fecha debe ser fecha ISO'),
  body('sedeId').optional({ nullable: true }).isInt(),
]);

router.get(
  '/',
  validate([
    query('pymeId').optional().isInt(),
    query('sedeId').optional().isInt(),
    query('categoria').optional().isString(),
    query('rango').optional().isIn(['este-mes', 'mes-pasado', 'trimestre', 'anio', 'personalizado']),
    query('desde').optional().isISO8601().withMessage('desde debe ser fecha ISO'),
    query('hasta').optional().isISO8601().withMessage('hasta debe ser fecha ISO'),
  ]),
  asyncHandler(async (req, res) => {
    const gastos = await gastosService.list(req.user, req.query);
    res.json({ ok: true, gastos, categorias: gastosService.GASTO_CATEGORIAS });
  })
);

router.post('/', gastoBody, asyncHandler(async (req, res) => {
  const gasto = await gastosService.create(req.user, req.body);
  res.status(201).json({ ok: true, gasto });
}));

router.post(
  '/duplicar-mes',
  validate([
    body('pymeId').isInt().withMessage('pymeId es obligatorio'),
    body('sedeId').optional({ nullable: true }).isInt(),
  ]),
  asyncHandler(async (req, res) => {
    const resultado = await gastosService.duplicarMesAnterior(req.user, req.body);
    res.status(201).json({ ok: true, ...resultado });
  })
);

router.put('/:id', gastoPatch, asyncHandler(async (req, res) => {
  const gasto = await gastosService.update(req.params.id, req.user, req.body);
  res.json({ ok: true, gasto });
}));

router.delete('/:id', idParam, asyncHandler(async (req, res) => {
  await gastosService.remove(req.params.id, req.user);
  res.json({ ok: true, message: 'Gasto eliminado' });
}));

module.exports = router;

const pymesService = require('../services/pymes.service');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middlewares/validate.middleware');
const { body, param, query } = require('express-validator');
const { authenticate } = require('../middlewares/auth.middleware');
const { Router } = require('express');

const router = Router();
router.use(authenticate);

const pymeValidations = validate([
  body('nombre').notEmpty().withMessage('El nombre es obligatorio'),
  body('tipo').optional().isIn([
    'MINIMARKET', 'TIENDA', 'FERRETERIA', 'FARMACIA', 'PAPELERIA',
    'RESTAURANTE', 'CAFETERIA', 'PANADERIA', 'LICORERA', 'VETERINARIA', 'OTRO',
  ]).withMessage('Tipo de PYME inválido'),
  body('sector').optional().isString(),
  body('ciudad').optional().isString(),
  body('direccion').optional().isString(),
  body('telefono').optional().isString(),
  body('descripcion').optional().isString(),
]);

const idParam = validate([param('id').isInt().withMessage('ID inválido')]);

router.get(
  '/',
  validate([query('search').optional().isString()]),
  asyncHandler(async (req, res) => {
    const pymes = await pymesService.list(req.user, req.query);
    res.json({ ok: true, pymes });
  })
);

router.post('/', pymeValidations, asyncHandler(async (req, res) => {
  const pyme = await pymesService.create(req.user, req.body);
  res.status(201).json({ ok: true, pyme });
}));

router.get('/:id', idParam, asyncHandler(async (req, res) => {
  const pyme = await pymesService.getById(req.params.id, req.user);
  res.json({ ok: true, pyme });
}));

router.put('/:id', idParam, pymeValidations, asyncHandler(async (req, res) => {
  const pyme = await pymesService.update(req.params.id, req.user, req.body);
  res.json({ ok: true, pyme });
}));

router.delete('/:id', idParam, asyncHandler(async (req, res) => {
  await pymesService.remove(req.params.id, req.user);
  res.json({ ok: true, message: 'PYME eliminada' });
}));

module.exports = router;

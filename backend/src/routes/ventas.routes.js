const ventasService = require('../services/ventas.service');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middlewares/validate.middleware');
const { body, query } = require('express-validator');
const { authenticate } = require('../middlewares/auth.middleware');
const { Router } = require('express');

const router = Router();
router.use(authenticate);

const ventaValidations = validate([
  body('productoId').isInt().withMessage('productoId es obligatorio'),
  body('pymeId').optional().isInt().withMessage('pymeId inválido'),
  body('cantidad').isInt({ min: 1 }).withMessage('La cantidad debe ser mayor a 0'),
  body('precioUnitario').isFloat({ min: 0 }).withMessage('Precio unitario inválido'),
]);

router.get(
  '/',
  validate([
    query('pymeId').optional().isInt(),
    query('desde').optional().isISO8601().withMessage('desde debe ser fecha ISO'),
    query('hasta').optional().isISO8601().withMessage('hasta debe ser fecha ISO'),
  ]),
  asyncHandler(async (req, res) => {
    const ventas = await ventasService.list(req.user, req.query);
    res.json({ ok: true, ventas });
  })
);

router.post('/', ventaValidations, asyncHandler(async (req, res) => {
  const venta = await ventasService.create(req.user, req.body);
  res.status(201).json({ ok: true, venta });
}));

module.exports = router;

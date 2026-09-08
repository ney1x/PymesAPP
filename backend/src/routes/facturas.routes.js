const facturasService = require('../services/facturas.service');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middlewares/validate.middleware');
const { body, query } = require('express-validator');
const { authenticate } = require('../middlewares/auth.middleware');
const { Router } = require('express');

const router = Router();
router.use(authenticate);

const facturaValidations = validate([
  body('pymeId').optional().isInt().withMessage('pymeId inválido'),
  body('sedeId').optional().isInt().withMessage('sedeId inválido'),
  body('lineas').isArray({ min: 1 }).withMessage('lineas debe ser un arreglo con al menos un producto'),
  body('lineas.*.productoId').isInt().withMessage('productoId es obligatorio en cada línea'),
  // `cantidad` no aplica a las líneas GRANEL (llevan `granel: {modo,valor,unidad}`);
  // el servicio exige una u otra según la presentación del producto.
  body('lineas.*.cantidad').optional().isInt({ min: 1 }).withMessage('La cantidad debe ser mayor a 0 en cada línea'),
  body('lineas.*.precioUnitario').optional().isFloat({ min: 0 }).withMessage('Precio unitario inválido en cada línea'),
  body('lineas.*.presentacion').optional().isIn(['UNIDAD', 'CAJA', 'GRANEL']).withMessage('Presentación inválida en una línea'),
  body('lineas.*.granel').optional().isObject().withMessage('Datos de granel inválidos en una línea'),
  body('lineas.*.granel.modo').optional().isIn(['MEDIDA', 'IMPORTE']).withMessage('Modo de granel inválido'),
  body('lineas.*.granel.valor').optional().isFloat({ gt: 0 }).withMessage('Cantidad a granel inválida'),
  body('lineas.*.granel.unidad').optional().isIn(['kg', 'lb', 'oz', 'g', 'L', 'ml']).withMessage('Unidad de granel inválida'),
  body('montoRecibido').optional().isFloat({ min: 0 }).withMessage('Monto recibido inválido'),
]);

router.get(
  '/',
  validate([
    query('pymeId').optional().isInt(),
    query('sedeId').optional().isInt(),
    query('desde').optional().isISO8601().withMessage('desde debe ser fecha ISO'),
    query('hasta').optional().isISO8601().withMessage('hasta debe ser fecha ISO'),
  ]),
  asyncHandler(async (req, res) => {
    const facturas = await facturasService.list(req.user, req.query);
    res.json({ ok: true, facturas });
  })
);

router.post('/', facturaValidations, asyncHandler(async (req, res) => {
  const factura = await facturasService.create(req.user, req.body);
  res.status(201).json({ ok: true, factura });
}));

module.exports = router;

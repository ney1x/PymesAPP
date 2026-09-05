const productosService = require('../services/productos.service');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middlewares/validate.middleware');
const { body, param, query } = require('express-validator');
const { authenticate } = require('../middlewares/auth.middleware');
const { Router } = require('express');

const router = Router();
router.use(authenticate);

const productoValidations = validate([
  body('pymeId').isInt().withMessage('pymeId es obligatorio'),
  body('sedeId').optional({ nullable: true }).isInt().withMessage('sedeId inválido'),
  body('nombre').notEmpty().withMessage('El nombre es obligatorio'),
  body('codigo').notEmpty().withMessage('El código es obligatorio'),
  body('precioVenta').isFloat({ min: 0 }).withMessage('Precio de venta inválido'),
  body('costo').isFloat({ min: 0 }).withMessage('Costo inválido'),
  body('categoria').optional().isString(),
  body('descripcion').optional().isString(),
  body('leadTimeDias').optional().isInt({ min: 0 }).withMessage('Lead time inválido'),
  body('stockSeguridad').optional().isInt({ min: 0 }).withMessage('Stock de seguridad inválido'),
  body('estado').optional().isIn(['ACTIVO', 'INACTIVO']).withMessage('Estado inválido'),
  body('inventario').optional().isObject().withMessage('inventario debe ser un objeto'),
  body('unidadesPorCaja')
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 2 })
    .withMessage('Unidades por caja debe ser un entero de 2 o más'),
  body('codigoCaja').optional({ nullable: true }).isString(),
  body('precioCaja').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('Precio de caja inválido'),
  body('costoCaja').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('Costo de caja inválido'),
]);

const idParam = validate([param('id').isInt().withMessage('ID inválido')]);

router.get(
  '/',
  validate([query('pymeId').optional().isInt(), query('sedeId').optional().isInt()]),
  asyncHandler(async (req, res) => {
    const productos = await productosService.list(req.user, req.query);
    res.json({ ok: true, productos });
  })
);

router.post('/', productoValidations, asyncHandler(async (req, res) => {
  const producto = await productosService.create(req.user, req.body);
  res.status(201).json({ ok: true, producto });
}));

router.post(
  '/importar',
  validate([
    body('pymeId').isInt().withMessage('pymeId es obligatorio'),
    body('productos').isArray({ min: 1 }).withMessage('productos debe ser un arreglo no vacío'),
  ]),
  asyncHandler(async (req, res) => {
    const resultado = await productosService.bulkCreate(req.user, req.body);
    res.status(201).json({ ok: true, ...resultado });
  })
);

router.get('/:id', idParam, asyncHandler(async (req, res) => {
  const producto = await productosService.getById(req.params.id, req.user);
  res.json({ ok: true, producto });
}));

router.put('/:id', idParam, productoValidations, asyncHandler(async (req, res) => {
  const producto = await productosService.update(req.params.id, req.user, req.body);
  res.json({ ok: true, producto });
}));

router.delete('/:id', idParam, asyncHandler(async (req, res) => {
  await productosService.remove(req.params.id, req.user);
  res.json({ ok: true, message: 'Producto eliminado' });
}));

module.exports = router;

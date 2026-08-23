const prediccionesService = require('../services/predicciones.service');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middlewares/validate.middleware');
const { query, param } = require('express-validator');
const { authenticate } = require('../middlewares/auth.middleware');
const { Router } = require('express');

const router = Router();
router.use(authenticate);

router.get(
  '/',
  validate([
    query('productoId').optional().isInt(),
    query('pymeId').optional().isInt(),
    query('sedeId').optional().isInt(),
  ]),
  asyncHandler(async (req, res) => {
    const predicciones = await prediccionesService.list(req.user, req.query);
    res.json({ ok: true, predicciones });
  })
);

router.post(
  '/generar',
  validate([
    query('pymeId').optional().isInt(),
    query('sedeId').optional().isInt(),
    query('horizonteDias').optional().isInt({ min: 1, max: 120 }),
  ]),
  asyncHandler(async (req, res) => {
    const ranking = await prediccionesService.generarTodo(req.user, req.query);
    res.json({ ok: true, ranking });
  })
);

router.post(
  '/generar/:productoId',
  validate([
    param('productoId').isInt().withMessage('ID inválido'),
    query('horizonteDias').optional().isInt({ min: 1, max: 120 }),
  ]),
  asyncHandler(async (req, res) => {
    const prediccion = await prediccionesService.generarParaProducto(
      req.user,
      req.params.productoId,
      req.query.horizonteDias
    );
    res.status(201).json({ ok: true, prediccion });
  })
);

module.exports = router;

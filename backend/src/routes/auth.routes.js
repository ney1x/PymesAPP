const authService = require('../services/auth.service');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middlewares/validate.middleware');
const { body } = require('express-validator');
const { authenticate } = require('../middlewares/auth.middleware');
const { Router } = require('express');

const router = Router();

const registerValidations = validate([
  body('nombre').notEmpty().withMessage('El nombre es obligatorio'),
  body('email').isEmail().withMessage('Correo inválido'),
  body('password').isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres'),
  body('rol').optional().isIn(['COMERCIANTE', 'ADMIN']).withMessage('Rol inválido'),
  body('telefono').optional().isString(),
]);

const loginValidations = validate([
  body('email').isEmail().withMessage('Correo inválido'),
  body('password').notEmpty().withMessage('La contraseña es obligatoria'),
]);

router.post(
  '/register',
  registerValidations,
  asyncHandler(async (req, res) => {
    const result = await authService.register(req.body);
    res.status(201).json({ ok: true, ...result });
  })
);

router.post(
  '/login',
  loginValidations,
  asyncHandler(async (req, res) => {
    const result = await authService.login(req.body);
    res.json({ ok: true, ...result });
  })
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await authService.me(req.user.id);
    res.json({ ok: true, user });
  })
);

module.exports = router;

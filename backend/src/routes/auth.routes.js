const authService = require('../services/auth.service');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middlewares/validate.middleware');
const {
  registerLimiter,
  loginLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
  verifyEmailLimiter,
} = require('../middlewares/rateLimit.middleware');
const { body } = require('express-validator');
const { authenticate } = require('../middlewares/auth.middleware');
const { nodeEnv } = require('../config/env');
const { Router } = require('express');

const router = Router();

// httpOnly: JS (y por lo tanto un XSS) no puede leer esta cookie — el token
// nunca toca localStorage ni el DOM. sameSite:'lax' cubre CSRF en requests
// cross-site disparados por JS/forms (fetch/XHR/form POST desde otro sitio
// no manda la cookie), solo permite navegacion top-level GET.
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: nodeEnv === 'production',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
};

// clearCookie NO debe llevar maxAge: maxAge pisa el "expires: new Date(1)"
// que Express usa por defecto para borrar, y la cookie vacia queda viva 7
// dias mas en el navegador en vez de borrarse.
const CLEAR_COOKIE_OPTIONS = {
  httpOnly: COOKIE_OPTIONS.httpOnly,
  secure: COOKIE_OPTIONS.secure,
  sameSite: COOKIE_OPTIONS.sameSite,
  path: COOKIE_OPTIONS.path,
};

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

const forgotPasswordValidations = validate([
  body('email').isEmail().withMessage('Correo inválido'),
]);

const resetPasswordValidations = validate([
  body('email').isEmail().withMessage('Correo inválido'),
  body('codigo').isLength({ min: 6, max: 6 }).isNumeric().withMessage('El código debe tener 6 dígitos'),
  body('password').isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres'),
]);

const verifyEmailValidations = validate([
  body('email').isEmail().withMessage('Correo inválido'),
  body('codigo').isLength({ min: 6, max: 6 }).isNumeric().withMessage('El código debe tener 6 dígitos'),
]);

const updateMeValidations = validate([
  body('nombre').optional().notEmpty().withMessage('El nombre es obligatorio'),
  body('email').optional().isEmail().withMessage('Correo inválido'),
  body('telefono').optional({ nullable: true }).isString(),
  body('password').optional({ nullable: true }).isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres'),
  body('passwordActual').optional().isString(),
]);

router.post(
  '/register',
  registerLimiter,
  registerValidations,
  asyncHandler(async (req, res) => {
    await authService.register(req.body);
    res.status(201).json({ ok: true, message: 'Te enviamos un código de verificación a tu correo.' });
  })
);

router.post(
  '/verify-email',
  verifyEmailLimiter,
  verifyEmailValidations,
  asyncHandler(async (req, res) => {
    const { token, user } = await authService.verifyEmail(req.body);
    res.cookie('token', token, COOKIE_OPTIONS);
    res.json({ ok: true, user });
  })
);

router.post(
  '/login',
  loginLimiter,
  loginValidations,
  asyncHandler(async (req, res) => {
    const { token, user } = await authService.login(req.body);
    res.cookie('token', token, COOKIE_OPTIONS);
    res.json({ ok: true, user });
  })
);

router.post(
  '/forgot-password',
  forgotPasswordLimiter,
  forgotPasswordValidations,
  asyncHandler(async (req, res) => {
    await authService.forgotPassword(req.body);
    res.json({ ok: true, message: 'Si el correo está registrado, te enviamos un código.' });
  })
);

router.post(
  '/reset-password',
  resetPasswordLimiter,
  resetPasswordValidations,
  asyncHandler(async (req, res) => {
    await authService.resetPassword(req.body);
    res.json({ ok: true, message: 'Contraseña actualizada con éxito.' });
  })
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    res.clearCookie('token', CLEAR_COOKIE_OPTIONS);
    res.json({ ok: true, message: 'Sesión cerrada' });
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

router.put(
  '/me',
  authenticate,
  updateMeValidations,
  asyncHandler(async (req, res) => {
    const user = await authService.updateMe(req.user.id, req.body);
    res.json({ ok: true, user });
  })
);

module.exports = router;

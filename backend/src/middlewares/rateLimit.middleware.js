const rateLimit = require('express-rate-limit');

const MENSAJE_LIMITE = { ok: false, message: 'Demasiados intentos. Intenta de nuevo en unos minutos.' };
const baseOptions = { windowMs: 15 * 60 * 1000, standardHeaders: true, legacyHeaders: false, message: MENSAJE_LIMITE };

// Registro: cada request manda un correo (costo real), asi que cuenta
// siempre, exitoso o no. Instancia propia — antes compartia contador con
// login, y probar uno gastaba presupuesto del otro sin relacion entre si.
const registerLimiter = rateLimit({ ...baseOptions, max: 10 });

// Login: la logica de bloqueo es sobre INTENTOS INVALIDOS, no sobre uso
// normal. skipSuccessfulRequests hace que solo la contraseña incorrecta
// consuma presupuesto — loguear/desloguear/volver a entrar en una cuenta
// real no debe acercarte al limite.
const loginLimiter = rateLimit({ ...baseOptions, max: 10, skipSuccessfulRequests: true });

// Olvidé mi contraseña: no hay "exito/fallo" que distinguir (la respuesta es
// siempre la misma, exista o no el correo, para no filtrar cuentas) — cada
// solicitud cuesta un correo real, asi que cuenta todas.
const forgotPasswordLimiter = rateLimit({ ...baseOptions, max: 5 });

// Verificar codigo (reset de contraseña o de correo al registrarse): el
// codigo correcto no debe gastar presupuesto — solo adivinar mal. Cada uno
// tiene su propia instancia para no compartir contador con los demas
// endpoints de este grupo.
const resetPasswordLimiter = rateLimit({ ...baseOptions, max: 5, skipSuccessfulRequests: true });
const verifyEmailLimiter = rateLimit({ ...baseOptions, max: 5, skipSuccessfulRequests: true });

module.exports = { registerLimiter, loginLimiter, forgotPasswordLimiter, resetPasswordLimiter, verifyEmailLimiter };

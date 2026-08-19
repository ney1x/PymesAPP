const rateLimit = require('express-rate-limit');

// Login/register: 10 intentos por IP cada 15 min. Cuenta tambien los
// intentos fallidos (no solo exitosos) — eso es lo que frena fuerza bruta.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: 'Demasiados intentos. Intenta de nuevo en unos minutos.' },
});

module.exports = { authLimiter };

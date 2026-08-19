const ApiError = require('../utils/ApiError');
const { verifyToken } = require('../utils/jwt');

const authenticate = (req, _res, next) => {
  const token = req.cookies?.token;

  if (!token) {
    return next(new ApiError(401, 'No autorizado: token no proporcionado'));
  }

  try {
    const payload = verifyToken(token);
    req.user = { id: payload.id, rol: payload.rol, email: payload.email };
    return next();
  } catch (err) {
    return next(new ApiError(401, 'No autorizado: token inválido o expirado'));
  }
};

const authorize = (...roles) => (req, _res, next) => {
  if (!roles.includes(req.user.rol)) {
    return next(new ApiError(403, 'Acceso denegado para este rol'));
  }
  return next();
};

module.exports = { authenticate, authorize };

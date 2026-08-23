const ApiError = require('../utils/ApiError');
const { verifyToken } = require('../utils/jwt');
const prisma = require('../lib/prisma');

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

// Rol por PYME: el ADMIN global siempre pasa; el dueño histórico (pyme.userId)
// cuenta como OWNER aunque no tenga fila en pyme_membresia (pymes creadas antes
// de la migración de equipos); el resto se resuelve por membresía activa.
const requirePymeRole = (...roles) => async (req, _res, next) => {
  try {
    const pymeId = Number(req.params.pymeId || req.params.id);
    if (!pymeId) return next(new ApiError(400, 'pymeId requerido'));

    if (req.user.rol === 'ADMIN') {
      req.pymeRol = 'OWNER';
      return next();
    }

    const pyme = await prisma.pyme.findUnique({ where: { id: pymeId } });
    if (!pyme) return next(new ApiError(404, 'PYME no encontrada'));

    let rol = null;
    if (pyme.userId === req.user.id) {
      rol = 'OWNER';
    } else {
      const membresia = await prisma.pyme_membresia.findFirst({
        where: { pymeId, userId: req.user.id, activo: true, estado: 'ACEPTADA' },
      });
      rol = membresia?.rol ?? null;
    }

    if (!rol || !roles.includes(rol)) {
      return next(new ApiError(403, 'Acceso denegado para este rol en la PYME'));
    }

    req.pymeRol = rol;
    return next();
  } catch (err) {
    return next(err);
  }
};

module.exports = { authenticate, authorize, requirePymeRole };

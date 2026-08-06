const ApiError = require('../utils/ApiError');

const notFound = (req, _res, next) => {
  next(new ApiError(404, `Ruta no encontrada: ${req.method} ${req.originalUrl}`));
};

const errorHandler = (err, _req, res, _next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Error interno del servidor';
  let details = err.details || null;

  if (err.code === 'P2002') {
    statusCode = 409;
    message = 'Ya existe un registro con ese valor único';
  }

  if (err.code === 'P2025') {
    statusCode = 404;
    message = 'Registro no encontrado';
  }

  if (err.name === 'ValidationError' || err.type === 'validation') {
    statusCode = 400;
    message = 'Datos inválidos';
    details = err.details;
  }

  console.error(`[Error] ${statusCode} - ${message}`, err);

  res.status(statusCode).json({
    ok: false,
    message,
    ...(details ? { details } : {}),
  });
};

module.exports = { notFound, errorHandler };

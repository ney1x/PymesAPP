const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

const validate = (validations) => [
  ...validations,
  (req, _res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(
        new ApiError(400, 'Datos inválidos', errors.array().map((e) => e.msg))
      );
    }
    return next();
  },
];

module.exports = validate;

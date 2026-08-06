const jwt = require('jsonwebtoken');
const { jwtSecret, jwtExpiresIn } = require('../config/env');

const signToken = (payload) => jwt.sign(payload, jwtSecret, { expiresIn: jwtExpiresIn });

const verifyToken = (token) => jwt.verify(token, jwtSecret);

module.exports = { signToken, verifyToken };

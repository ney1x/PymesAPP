const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const ApiError = require('../utils/ApiError');
const { signToken } = require('../utils/jwt');

const toUserResponse = (user) => ({
  id: user.id,
  nombre: user.nombre,
  email: user.email,
  rol: user.rol,
  telefono: user.telefono,
});

const register = async ({ nombre, email, password, rol, telefono }) => {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new ApiError(409, 'Ya existe un usuario con ese correo');
  }

  const hashed = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: { nombre, email, password: hashed, rol, telefono },
  });

  const token = signToken({ id: user.id, rol: user.rol, email: user.email });

  return { token, user: toUserResponse(user) };
};

const login = async ({ email, password }) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new ApiError(401, 'Credenciales inválidas');
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    throw new ApiError(401, 'Credenciales inválidas');
  }

  const token = signToken({ id: user.id, rol: user.rol, email: user.email });

  return { token, user: toUserResponse(user) };
};

const me = async (userId) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new ApiError(404, 'Usuario no encontrado');
  }
  return toUserResponse(user);
};

module.exports = { register, login, me };

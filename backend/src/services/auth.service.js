const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const ApiError = require('../utils/ApiError');
const { signToken } = require('../utils/jwt');
const { sendResetCodeEmail, sendVerificationEmail } = require('../utils/mailer');

const CODE_TTL_MS = 15 * 60 * 1000;
const CODE_MAX_INTENTOS = 5;

// Codigo de 6 digitos, hasheado igual que una contraseña — nunca se guarda
// en texto plano, se reusa tanto para reset de contraseña como verificacion
// de correo.
const crearCodigo = async () => {
  const codigo = crypto.randomInt(100000, 1000000).toString();
  const hash = await bcrypt.hash(codigo, 10);
  return { codigo, hash, expiresAt: new Date(Date.now() + CODE_TTL_MS) };
};

// Mismo criterio que forgotPassword: un fallo al enviar el correo (Gmail
// caído, credenciales mal puestas, cuota agotada) no debe tumbar el registro
// con un 500. La cuenta queda sin verificar y el reintento de registro
// —o el reenvío desde la pantalla de verificación— manda un código nuevo.
const enviarCodigoVerificacion = async (email, codigo) => {
  try {
    await sendVerificationEmail(email, codigo);
  } catch (err) {
    console.error('Error enviando correo de verificación:', err.message);
  }
};

const toUserResponse = (user) => ({
  id: user.id,
  nombre: user.nombre,
  email: user.email,
  rol: user.rol,
  telefono: user.telefono,
});

// No deja token ni cookie — la cuenta existe pero queda sin uso hasta que
// se verifique el correo con el código (ver verifyEmail). Asi un bot no
// puede generar cuentas en masa sin acceso real a una bandeja de entrada.
const register = async ({ nombre, email, password, rol, telefono }) => {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.emailVerificado) {
      throw new ApiError(409, 'Ya existe un usuario con ese correo');
    }
    // Cuenta a medio registrar (nunca verificada) — se trata como un
    // reintento legítimo: se pisan los datos y se manda un código nuevo,
    // en vez de dejar a alguien atascado porque no le llegó el primero.
    const hashed = await bcrypt.hash(password, 10);
    const { codigo, hash, expiresAt } = await crearCodigo();
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        nombre,
        password: hashed,
        telefono,
        verifCodeHash: hash,
        verifCodeExpiresAt: expiresAt,
        verifCodeIntentos: 0,
      },
    });
    await enviarCodigoVerificacion(email, codigo);
    return;
  }

  const hashed = await bcrypt.hash(password, 10);
  const { codigo, hash, expiresAt } = await crearCodigo();

  await prisma.user.create({
    data: {
      nombre,
      email,
      password: hashed,
      rol,
      telefono,
      verifCodeHash: hash,
      verifCodeExpiresAt: expiresAt,
    },
  });

  await enviarCodigoVerificacion(email, codigo);
};

const verifyEmail = async ({ email, codigo }) => {
  const invalido = () => new ApiError(400, 'Código inválido o expirado');

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.verifCodeHash || !user.verifCodeExpiresAt) {
    throw invalido();
  }
  if (user.verifCodeExpiresAt < new Date()) {
    throw invalido();
  }
  if (user.verifCodeIntentos >= CODE_MAX_INTENTOS) {
    throw new ApiError(429, 'Demasiados intentos. Solicita un nuevo código.');
  }

  const valido = await bcrypt.compare(codigo, user.verifCodeHash);
  if (!valido) {
    await prisma.user.update({
      where: { id: user.id },
      data: { verifCodeIntentos: { increment: 1 } },
    });
    throw invalido();
  }

  const verificado = await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerificado: true,
      verifCodeHash: null,
      verifCodeExpiresAt: null,
      verifCodeIntentos: 0,
    },
  });

  const token = signToken({ id: verificado.id, rol: verificado.rol, email: verificado.email });
  return { token, user: toUserResponse(verificado) };
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

  if (!user.emailVerificado) {
    throw new ApiError(403, 'Verifica tu correo antes de iniciar sesión. Revisa tu bandeja de entrada.');
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

const updateMe = async (userId, { nombre, email, telefono, password, passwordActual }) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new ApiError(404, 'Usuario no encontrado');
  }

  const data = {};
  if (nombre !== undefined) data.nombre = nombre;
  if (telefono !== undefined) data.telefono = telefono || null;

  if (email !== undefined && email !== user.email) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ApiError(409, 'Ya existe un usuario con ese correo');
    }
    data.email = email;
  }

  if (password) {
    const valid = await bcrypt.compare(passwordActual || '', user.password);
    if (!valid) {
      throw new ApiError(400, 'Contraseña actual incorrecta');
    }
    data.password = await bcrypt.hash(password, 10);
  }

  const updated = await prisma.user.update({ where: { id: userId }, data });
  return toUserResponse(updated);
};

// No revela si el correo existe o no — misma respuesta genérica en ambos
// casos, para que no se pueda usar este endpoint para enumerar usuarios
// registrados.
const forgotPassword = async ({ email }) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;

  const { codigo, hash, expiresAt } = await crearCodigo();

  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetCodeHash: hash,
      resetCodeExpiresAt: expiresAt,
      resetCodeIntentos: 0,
    },
  });

  try {
    await sendResetCodeEmail(user.email, codigo);
  } catch (err) {
    // No se propaga: el cliente ya recibe la misma respuesta genérica haya
    // ido bien o mal el envío. Queda en logs del servidor para diagnosticar
    // credenciales de Gmail mal configuradas, cuota agotada, etc.
    console.error('Error enviando correo de recuperación:', err.message);
  }
};

const resetPassword = async ({ email, codigo, password }) => {
  const invalido = () => new ApiError(400, 'Código inválido o expirado');

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.resetCodeHash || !user.resetCodeExpiresAt) {
    throw invalido();
  }
  if (user.resetCodeExpiresAt < new Date()) {
    throw invalido();
  }
  if (user.resetCodeIntentos >= CODE_MAX_INTENTOS) {
    throw new ApiError(429, 'Demasiados intentos. Solicita un nuevo código.');
  }

  const valido = await bcrypt.compare(codigo, user.resetCodeHash);
  if (!valido) {
    await prisma.user.update({
      where: { id: user.id },
      data: { resetCodeIntentos: { increment: 1 } },
    });
    throw invalido();
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: await bcrypt.hash(password, 10),
      resetCodeHash: null,
      resetCodeExpiresAt: null,
      resetCodeIntentos: 0,
    },
  });
};

module.exports = { register, login, verifyEmail, me, updateMe, forgotPassword, resetPassword };

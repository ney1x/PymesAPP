const nodemailer = require('nodemailer');
const { gmailUser, gmailAppPassword } = require('../config/env');

// Sin credenciales de Gmail la app sigue arrancando (ver .env): en ese modo
// los correos no se envían y el código queda en los logs del servidor para
// que el operador lo lea. Con credenciales, comportamiento normal por Gmail.
const emailHabilitado = Boolean(gmailUser && gmailAppPassword);

const transporter = emailHabilitado
  ? nodemailer.createTransport({
      service: 'gmail',
      auth: { user: gmailUser, pass: gmailAppPassword },
    })
  : null;

const registrarCodigoEnLog = (tipo, destinatario, codigo) => {
  console.warn(
    `[mailer] Envío de correo deshabilitado (sin GMAIL_USER/GMAIL_APP_PASSWORD). ` +
      `Código de ${tipo} para ${destinatario}: ${codigo}`
  );
};

const sendResetCodeEmail = async (destinatario, codigo) => {
  if (!emailHabilitado) {
    registrarCodigoEnLog('recuperación', destinatario, codigo);
    return;
  }
  await transporter.sendMail({
    from: `"PymesAPP" <${gmailUser}>`,
    to: destinatario,
    subject: 'Código para recuperar tu contraseña',
    text: `Tu código de recuperación es: ${codigo}\n\nExpira en 15 minutos. Si no pediste este código, ignora este correo.`,
    html: `
      <div style="font-family: sans-serif; max-width: 420px; margin: 0 auto;">
        <h2 style="color: #122a47;">Recuperar contraseña</h2>
        <p>Usa este código para continuar. Expira en 15 minutos.</p>
        <p style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #c97a0c; margin: 24px 0;">${codigo}</p>
        <p style="color: #54606f; font-size: 13px;">Si no pediste este código, podés ignorar este correo.</p>
      </div>
    `,
  });
};

const sendVerificationEmail = async (destinatario, codigo) => {
  if (!emailHabilitado) {
    registrarCodigoEnLog('verificación', destinatario, codigo);
    return;
  }
  await transporter.sendMail({
    from: `"PymesAPP" <${gmailUser}>`,
    to: destinatario,
    subject: 'Verifica tu correo en PymesAPP',
    text: `Tu código de verificación es: ${codigo}\n\nExpira en 15 minutos. Si no creaste esta cuenta, ignora este correo.`,
    html: `
      <div style="font-family: sans-serif; max-width: 420px; margin: 0 auto;">
        <h2 style="color: #122a47;">Verifica tu correo</h2>
        <p>Usa este código para activar tu cuenta. Expira en 15 minutos.</p>
        <p style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #c97a0c; margin: 24px 0;">${codigo}</p>
        <p style="color: #54606f; font-size: 13px;">Si no creaste esta cuenta, podés ignorar este correo.</p>
      </div>
    `,
  });
};

module.exports = { sendResetCodeEmail, sendVerificationEmail, emailHabilitado };

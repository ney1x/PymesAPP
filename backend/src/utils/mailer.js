const nodemailer = require('nodemailer');
const { gmailUser, gmailAppPassword } = require('../config/env');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: gmailUser, pass: gmailAppPassword },
});

const sendResetCodeEmail = async (destinatario, codigo) => {
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

module.exports = { sendResetCodeEmail, sendVerificationEmail };

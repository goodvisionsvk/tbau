// Odosielanie e-mailov cez SMTP (nodemailer). Konfigurácia je v .env (viď config.smtp).
// Ak SMTP nie je nakonfigurované, funkcie to jasne oznámia – portál funguje aj bez neho
// (dopyty sa dajú poslať cez „Otvoriť v e-maile“/mailto).
const nodemailer = require('nodemailer');
const config = require('./config');

let transporter = null;

function isConfigured() {
  return !!(config.smtp.host && config.smtp.from);
}

function getTransporter() {
  if (!isConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
      connectionTimeout: 8000,
      greetingTimeout: 8000,
    });
  }
  return transporter;
}

// Overenie spojenia so SMTP serverom (pre test v sekcii Testy).
async function verify() {
  const t = getTransporter();
  if (!t) throw new Error('SMTP nie je nakonfigurované');
  return t.verify();
}

// Odoslanie e-mailu. opts: { to, subject, text, html, replyTo, cc, bcc }
async function sendMail(opts) {
  const t = getTransporter();
  if (!t) throw new Error('SMTP nie je nakonfigurované');
  return t.sendMail(Object.assign({ from: config.smtp.from }, opts));
}

module.exports = { isConfigured, verify, sendMail };

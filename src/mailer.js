// Odosielanie e-mailov cez SMTP (nodemailer). Konfigurácia sa číta dynamicky z DB (app_settings)
// s fallbackom na .env – dá sa teda meniť priamo v portáli (Nastavenia → E-mail / SMTP).
// Ak SMTP nie je nakonfigurované, portál funguje ďalej (dopyty cez „Otvoriť v e-maile“/mailto).
const nodemailer = require('nodemailer');
const store = require('./settings-store');

function isConfigured() {
  const c = store.getSmtp();
  return !!(c.host && c.from);
}

function buildTransporter() {
  const c = store.getSmtp();
  if (!(c.host && c.from)) return null;
  return nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.secure,
    auth: c.user ? { user: c.user, pass: c.pass } : undefined,
    connectionTimeout: 8000,
    greetingTimeout: 8000,
  });
}

// Overenie spojenia so SMTP serverom (pre test v sekcii Testy / Nastavenia).
async function verify() {
  const t = buildTransporter();
  if (!t) throw new Error('SMTP nie je nakonfigurované');
  return t.verify();
}

// Odoslanie e-mailu. opts: { to, subject, text, html, replyTo, cc, bcc }
async function sendMail(opts) {
  const c = store.getSmtp();
  const t = buildTransporter();
  if (!t) throw new Error('SMTP nie je nakonfigurované');
  return t.sendMail(Object.assign({ from: c.from }, opts));
}

module.exports = { isConfigured, verify, sendMail };

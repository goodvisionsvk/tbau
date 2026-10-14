const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db');
const constants = require('../constants');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireAdmin);

const ROLE_KEYS = Object.keys(constants.roles); // sef, admin, parcak, zamestnanec

// vygeneruj čitateľné dočasné heslo
function genPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  const bytes = crypto.randomBytes(14);
  for (let i = 0; i < 14; i++) out += chars[bytes[i] % chars.length];
  return out;
}

function listUsers() {
  return db
    .prepare('SELECT id, email, full_name, role, active, last_login, created_at, password_changed_at FROM users ORDER BY created_at')
    .all();
}

// otvorené samoobslužné žiadosti o reset hesla
function listResetRequests() {
  return db
    .prepare("SELECT id, email, user_id, created_at FROM password_reset_requests WHERE status = 'open' ORDER BY created_at")
    .all();
}

function renderUsers(res, extra = {}) {
  res.render('users', Object.assign({
    title: 'Používatelia',
    active: 'settings',
    users: listUsers(),
    roles: constants.roles,
    resetRequests: listResetRequests(),
    tempInfo: null,
    error: null,
  }, extra));
}

// GET /users
router.get('/', (req, res) => {
  renderUsers(res);
});

// POST /users – vytvorenie používateľa (dočasné heslo sa zobrazí raz)
router.post('/', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const fullName = (req.body.full_name || '').trim();
  const role = ROLE_KEYS.includes(req.body.role) ? req.body.role : 'zamestnanec';

  const render = (error, tempInfo = null) =>
    res.status(error ? 400 : 200).render('users', {
      title: 'Používatelia',
      active: 'settings',
      users: listUsers(),
      roles: constants.roles,
      resetRequests: listResetRequests(),
      error,
      tempInfo,
    });

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return render('Zadaj platný e-mail.');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email))
    return render('Používateľ s týmto e-mailom už existuje.');

  const tempPassword = genPassword();
  const hash = bcrypt.hashSync(tempPassword, 12);
  db.prepare(
    "INSERT INTO users (email, password_hash, full_name, role, must_change_password, password_changed_at) VALUES (?,?,?,?,1,datetime('now'))"
  ).run(email, hash, fullName, role);

  render(null, { email, password: tempPassword });
});

// reset hesla pre daného používateľa (vygeneruje dočasné heslo, vybaví prípadnú žiadosť)
function resetUserPassword(user, adminId) {
  const tempPassword = genPassword();
  db.prepare(
    "UPDATE users SET password_hash = ?, must_change_password = 1, password_changed_at = datetime('now') WHERE id = ?"
  ).run(bcrypt.hashSync(tempPassword, 12), user.id);
  // vybav otvorené žiadosti o reset pre tento e-mail
  db.prepare(
    "UPDATE password_reset_requests SET status = 'done', handled_by = ?, handled_at = datetime('now') WHERE email = ? AND status = 'open'"
  ).run(adminId, user.email);
  return tempPassword;
}

// POST /users/:id/reset – reset hesla
router.post('/:id/reset', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.redirect('/users');
  const tempPassword = resetUserPassword(user, req.user.id);
  renderUsers(res, { tempInfo: { email: user.email, password: tempPassword, reset: true } });
});

// POST /users/reset-request/:id/resolve – vybaviť žiadosť o reset (reset hesla ak účet existuje)
router.post('/reset-request/:id/resolve', (req, res) => {
  const reqRow = db.prepare("SELECT * FROM password_reset_requests WHERE id = ? AND status = 'open'").get(req.params.id);
  if (!reqRow) return res.redirect('/users');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(reqRow.email);
  if (user) {
    const tempPassword = resetUserPassword(user, req.user.id);
    return renderUsers(res, { tempInfo: { email: user.email, password: tempPassword, reset: true } });
  }
  // účet s týmto e-mailom neexistuje – len zavri žiadosť
  db.prepare("UPDATE password_reset_requests SET status = 'done', handled_by = ?, handled_at = datetime('now') WHERE id = ?").run(req.user.id, reqRow.id);
  renderUsers(res, { error: 'Pre tento e-mail neexistuje konto. Žiadosť bola uzavretá.' });
});

// POST /users/reset-request/:id/dismiss – zamietnuť/zahodiť žiadosť bez resetu
router.post('/reset-request/:id/dismiss', (req, res) => {
  db.prepare("UPDATE password_reset_requests SET status = 'done', handled_by = ?, handled_at = datetime('now') WHERE id = ? AND status = 'open'").run(req.user.id, req.params.id);
  res.redirect('/users');
});

// POST /users/:id/role – zmena roly
router.post('/:id/role', (req, res) => {
  const role = ROLE_KEYS.includes(req.body.role) ? req.body.role : null;
  if (role) db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  res.redirect('/users');
});

// POST /users/:id/toggle – aktivovať/deaktivovať
router.post('/:id/toggle', (req, res) => {
  if (Number(req.params.id) === req.user.id) return res.redirect('/users');
  db.prepare('UPDATE users SET active = 1 - active WHERE id = ?').run(req.params.id);
  res.redirect('/users');
});

// POST /users/:id/delete
router.post('/:id/delete', (req, res) => {
  if (Number(req.params.id) === req.user.id) return res.redirect('/users');
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.redirect('/users');
});

module.exports = router;

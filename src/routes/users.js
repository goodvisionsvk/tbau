const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireAdmin);

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
    .prepare('SELECT id, email, full_name, role, active, last_login, created_at FROM users ORDER BY created_at')
    .all();
}

// GET /users
router.get('/', (req, res) => {
  res.render('users', { title: 'Používatelia', active: 'users', users: listUsers(), tempInfo: null });
});

// POST /users – vytvorenie používateľa (dočasné heslo sa zobrazí raz)
router.post('/', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const fullName = (req.body.full_name || '').trim();
  const role = req.body.role === 'admin' ? 'admin' : 'user';

  const render = (error, tempInfo = null) =>
    res.status(error ? 400 : 200).render('users', {
      title: 'Používatelia',
      active: 'users',
      users: listUsers(),
      error,
      tempInfo,
    });

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return render('Zadaj platný e-mail.');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email))
    return render('Používateľ s týmto e-mailom už existuje.');

  const tempPassword = genPassword();
  const hash = bcrypt.hashSync(tempPassword, 12);
  db.prepare(
    'INSERT INTO users (email, password_hash, full_name, role, must_change_password) VALUES (?,?,?,?,1)'
  ).run(email, hash, fullName, role);

  render(null, { email, password: tempPassword });
});

// POST /users/:id/reset – reset hesla
router.post('/:id/reset', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.redirect('/users');
  const tempPassword = genPassword();
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(
    bcrypt.hashSync(tempPassword, 12),
    user.id
  );
  res.render('users', {
    title: 'Používatelia',
    active: 'users',
    users: listUsers(),
    tempInfo: { email: user.email, password: tempPassword, reset: true },
  });
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

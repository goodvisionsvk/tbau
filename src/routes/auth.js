const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /login
router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('login', { layout: 'layouts/public', title: 'Prihlásenie', error: null, email: '' });
});

// POST /login
router.post('/login', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';

  const fail = () =>
    res.status(401).render('login', {
      layout: 'layouts/public',
      title: 'Prihlásenie',
      error: 'Nesprávny e-mail alebo heslo.',
      email,
    });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !user.active) return fail();

  if (!bcrypt.compareSync(password, user.password_hash)) return fail();

  db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);

  // regenerácia session proti fixácii
  req.session.regenerate((err) => {
    if (err) return fail();
    req.session.userId = user.id;
    res.redirect(user.must_change_password ? '/account/password' : '/dashboard');
  });
});

// POST /logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// GET /account/password – zmena vlastného hesla
router.get('/account/password', requireAuth, (req, res) => {
  res.render('account-password', {
    title: 'Zmena hesla',
    error: null,
    forced: !!req.user.must_change_password,
  });
});

// POST /account/password
router.post('/account/password', requireAuth, (req, res) => {
  const { current_password, new_password, new_password2 } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

  const render = (error) =>
    res.status(400).render('account-password', {
      title: 'Zmena hesla',
      error,
      forced: !!req.user.must_change_password,
    });

  if (!bcrypt.compareSync(current_password || '', user.password_hash))
    return render('Aktuálne heslo nie je správne.');
  if (!new_password || new_password.length < 10)
    return render('Nové heslo musí mať aspoň 10 znakov.');
  if (new_password !== new_password2) return render('Nové heslá sa nezhodujú.');

  const hash = bcrypt.hashSync(new_password, 12);
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(
    hash,
    user.id
  );
  res.redirect('/dashboard');
});

module.exports = router;

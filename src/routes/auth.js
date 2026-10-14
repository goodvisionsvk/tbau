const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const mailer = require('../mailer');
const { requireAuth, passwordChangeReason } = require('../middleware/auth');
const passwordPolicy = require('../util/password');

const router = express.Router();

const REMEMBER_MS = 30 * 24 * 60 * 60 * 1000; // "zapamätať prihlásenie" = 30 dní

// GET /login
router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('login', { layout: 'layouts/public', title: 'Prihlásenie', error: null, email: '' });
});

// POST /login
router.post('/login', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const remember = !!req.body.remember;

  const fail = (msg) =>
    res.status(401).render('login', {
      layout: 'layouts/public',
      title: 'Prihlásenie',
      error: msg || 'Nesprávny e-mail alebo heslo.',
      email,
    });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return fail();
  if (!user.active) return fail('Toto konto je zablokované. Kontaktuj administrátora.');

  if (!bcrypt.compareSync(password, user.password_hash)) return fail();

  db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);

  // regenerácia session proti fixácii
  req.session.regenerate((err) => {
    if (err) return fail();
    req.session.userId = user.id;
    // "zapamätať prihlásenie" → predĺžená platnosť cookie (inak ostáva 8 h z konfigurácie)
    if (remember) req.session.cookie.maxAge = REMEMBER_MS;
    res.redirect(passwordChangeReason(user) ? '/account/password' : '/dashboard');
  });
});

// POST /logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// GET /forgot – samoobslužná žiadosť o reset hesla (bez SMTP)
router.get('/forgot', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('forgot', { layout: 'layouts/public', title: 'Zabudnuté heslo', error: null, sent: false });
});

// POST /forgot – vytvorí žiadosť; neprezrádza, či e-mail existuje
router.post('/forgot', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const render = (opts) =>
    res.render('forgot', Object.assign({ layout: 'layouts/public', title: 'Zabudnuté heslo', error: null, sent: false }, opts));

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return render({ error: 'Zadaj platný e-mail.' });

  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  // žiadosť zaznamenáme vždy (aj keď účet neexistuje) – nevyzradíme existenciu konta.
  // Ak už otvorená žiadosť existuje, nevytváraj duplicitnú.
  const open = db.prepare("SELECT id FROM password_reset_requests WHERE email = ? AND status = 'open'").get(email);
  if (!open) {
    db.prepare('INSERT INTO password_reset_requests (email, user_id) VALUES (?,?)').run(email, user ? user.id : null);
    notifyAdminsAboutReset(email); // fire-and-forget (ak je SMTP nakonfigurované)
  }
  render({ sent: true });
});

// Upozorní adminov e-mailom na novú žiadosť o reset hesla (neblokuje odpoveď).
function notifyAdminsAboutReset(email) {
  if (!mailer.isConfigured()) return;
  try {
    const admins = db.prepare("SELECT email FROM users WHERE role IN ('sef','admin') AND active = 1 AND email IS NOT NULL").all();
    if (!admins.length) return;
    mailer.sendMail({
      to: admins.map((a) => a.email).join(', '),
      subject: 'TBAU portál – žiadosť o reset hesla',
      text: `Používateľ s e-mailom "${email}" požiadal o reset hesla.\n\n` +
        'Vybav ju v portáli: Nastavenia → Používatelia → Žiadosti o reset hesla.',
    }).catch(() => {});
  } catch (e) { /* ignore */ }
}

// GET /account/password – zmena vlastného hesla
router.get('/account/password', requireAuth, (req, res) => {
  res.render('account-password', {
    title: 'Zmena hesla',
    error: null,
    reason: passwordChangeReason(req.user),
    rules: passwordPolicy.RULES,
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
      reason: passwordChangeReason(req.user),
      rules: passwordPolicy.RULES,
    });

  if (!bcrypt.compareSync(current_password || '', user.password_hash))
    return render('Aktuálne heslo nie je správne.');
  if (new_password !== new_password2) return render('Nové heslá sa nezhodujú.');
  const policyError = passwordPolicy.validate(new_password, { email: user.email });
  if (policyError) return render(policyError);
  if (bcrypt.compareSync(new_password, user.password_hash))
    return render('Nové heslo musí byť iné ako to aktuálne.');

  const hash = bcrypt.hashSync(new_password, 12);
  db.prepare(
    "UPDATE users SET password_hash = ?, must_change_password = 0, password_changed_at = datetime('now') WHERE id = ?"
  ).run(hash, user.id);
  res.redirect('/dashboard');
});

module.exports = router;

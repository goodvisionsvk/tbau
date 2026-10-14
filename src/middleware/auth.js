const password = require('../util/password');

const FULL_ACCESS = ['sef', 'admin'];

// Dôvod, prečo si používateľ musí zmeniť heslo (alebo null). Použité aj vo view.
function passwordChangeReason(user) {
  if (!user) return null;
  if (user.must_change_password) return 'forced';           // dočasné heslo / reset
  if (password.isExpired(user.password_changed_at)) return 'expired'; // staršie ako rok
  return null;
}

// Prihlásený používateľ je potrebný pre všetky interné stránky.
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  // vynútená zmena hesla: dočasné heslo (prvé prihlásenie / reset) alebo expirácia (1×/rok)
  if (req.user && req.path !== '/account/password' && passwordChangeReason(req.user)) {
    return res.redirect('/account/password');
  }
  next();
}

function deny(res) {
  return res.status(403).render('error', {
    title: 'Prístup zamietnutý',
    message: 'Na túto sekciu nemáš dostatočné oprávnenia.',
  });
}

// Plný prístup: Šéf alebo Administratíva (historicky "admin").
function requireFullAccess(req, res, next) {
  if (!req.user || !FULL_ACCESS.includes(req.user.role)) return deny(res);
  next();
}

// Spätná kompatibilita – "admin" sekcie teraz = plný prístup (šéf/admin).
const requireAdmin = requireFullAccess;

// Plný prístup alebo parťák (majster) – správa dochádzky stavieb.
function requireStaff(req, res, next) {
  if (!req.user || !(FULL_ACCESS.includes(req.user.role) || req.user.role === 'parcak')) return deny(res);
  next();
}

module.exports = { requireAuth, requireAdmin, requireFullAccess, requireStaff, FULL_ACCESS, passwordChangeReason };

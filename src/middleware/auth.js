// Prihlásený používateľ je potrebný pre všetky interné stránky.
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  // vynútená zmena hesla (napr. po prvom prihlásení s dočasným heslom)
  if (req.user && req.user.must_change_password && req.path !== '/account/password') {
    return res.redirect('/account/password');
  }
  next();
}

// Iba administrátor (napr. správa používateľov).
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).render('error', {
      title: 'Prístup zamietnutý',
      message: 'Na túto sekciu potrebuješ administrátorské oprávnenia.',
    });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };

const crypto = require('crypto');

// Jednoduchá synchronizer-token CSRF ochrana (bez závislostí).
function csrf(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;

  const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  if (mutating) {
    const sent = req.body && req.body._csrf;
    if (!sent || sent !== req.session.csrfToken) {
      return res.status(403).render('error', {
        title: 'Neplatný bezpečnostný token',
        message: 'Formulár vypršal alebo je neplatný. Skús to prosím znova.',
      });
    }
  }
  next();
}

module.exports = csrf;

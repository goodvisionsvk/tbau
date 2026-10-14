// Politika hesiel: sila (parametre) + maximálny vek (vynútená zmena aspoň raz za rok).
// Používa sa pri zmene vlastného hesla aj pri kontrole v auth middleware.

const MAX_AGE_DAYS = 365; // heslo treba zmeniť aspoň raz za rok

// Pravidlá na zobrazenie používateľovi (musí sedieť s validate() nižšie).
const RULES = [
  'aspoň 10 znakov',
  'malé aj veľké písmeno',
  'aspoň jednu číslicu',
  'nesmie obsahovať tvoj e-mail',
];

// Vráti chybovú hlášku (string) alebo null, ak je heslo v poriadku.
function validate(pw, opts = {}) {
  pw = pw || '';
  if (pw.length < 10) return 'Heslo musí mať aspoň 10 znakov.';
  if (!/[a-z]/.test(pw)) return 'Heslo musí obsahovať malé písmeno.';
  if (!/[A-Z]/.test(pw)) return 'Heslo musí obsahovať veľké písmeno.';
  if (!/[0-9]/.test(pw)) return 'Heslo musí obsahovať aspoň jednu číslicu.';
  const local = (opts.email || '').toLowerCase().split('@')[0];
  if (local && local.length >= 3 && pw.toLowerCase().includes(local))
    return 'Heslo nesmie obsahovať tvoj e-mail.';
  return null;
}

// true, ak je heslo staršie ako MAX_AGE_DAYS (podľa password_changed_at).
function isExpired(changedAt) {
  if (!changedAt) return false; // neznámy dátum neblokujeme (doplní sa pri najbližšej zmene)
  const t = Date.parse(changedAt.replace(' ', 'T') + 'Z');
  if (isNaN(t)) return false;
  return Date.now() - t > MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

module.exports = { MAX_AGE_DAYS, RULES, validate, isExpired };

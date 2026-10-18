// Šifrovanie citlivých hodnôt v DB (AES-256-GCM). Kľúč je v .env (SETTINGS_KEY),
// ktorý je v zálohe GPG-šifrovaný – takže ani únik DB zálohy neodhalí tajomstvá bez kľúča.
// Bez nastaveného kľúča sa hodnoty ukladajú ako predtým (plaintext) – appka funguje ďalej.
const crypto = require('crypto');

function key() {
  const k = (process.env.SETTINGS_KEY || '').trim();
  if (!k) return null;
  let buf;
  if (/^[0-9a-fA-F]{64}$/.test(k)) buf = Buffer.from(k, 'hex');
  else { try { buf = Buffer.from(k, 'base64'); } catch (e) { return null; } }
  return buf.length === 32 ? buf : null;
}

function isEnc(v) { return typeof v === 'string' && v.startsWith('enc:v1:'); }

function encrypt(plain) {
  const k = key();
  if (!k || plain == null || plain === '') return plain;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', k, iv);
  const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  const tag = c.getAuthTag();
  return 'enc:v1:' + Buffer.concat([iv, tag, ct]).toString('base64');
}

function decrypt(val) {
  if (!isEnc(val)) return val;
  const k = key();
  if (!k) return val; // bez kľúča nevieme dešifrovať – vrátime ako je
  try {
    const raw = Buffer.from(val.slice(7), 'base64');
    const iv = raw.subarray(0, 12), tag = raw.subarray(12, 28), ct = raw.subarray(28);
    const d = crypto.createDecipheriv('aes-256-gcm', k, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
  } catch (e) {
    return val;
  }
}

module.exports = { encrypt, decrypt, isEnc, hasKey: () => !!key() };

// Nastavenia aplikácie uložené v DB (tabuľka app_settings), napr. SMTP konfigurácia.
// Prednosť má hodnota z DB; ak chýba, použije sa hodnota z .env (config).
const db = require('./db');
const config = require('./config');
const secretbox = require('./util/secretbox');

// kľúče, ktorých hodnota sa v DB šifruje (tajomstvá)
const SECRET_KEYS = new Set(['smtp_pass', 'ai_api_key']);

function get(key, fallback = null) {
  const r = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  if (!r || r.value == null) return fallback;
  return secretbox.decrypt(r.value); // dešifruje len enc: hodnoty, inak vráti ako je
}

function set(key, value) {
  let v = value == null ? null : String(value);
  if (v != null && SECRET_KEYS.has(key)) v = secretbox.encrypt(v);
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?,?,datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).run(key, v);
}

// Aktuálna SMTP konfigurácia (DB má prednosť pred .env).
function getSmtp() {
  const c = config.smtp;
  return {
    host: get('smtp_host', c.host) || '',
    port: parseInt(get('smtp_port', String(c.port)) || '587', 10),
    secure: get('smtp_secure', c.secure ? '1' : '0') === '1',
    user: get('smtp_user', c.user) || '',
    pass: get('smtp_pass', c.pass) || '',
    from: get('smtp_from', c.from) || '',
  };
}

module.exports = { get, set, getSmtp, SECRET_KEYS, secretbox };

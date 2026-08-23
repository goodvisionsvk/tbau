// CLI na vytvorenie používateľa:
//   node src/db/create-user.js <email> "<Cele meno>" [admin|user]
// Vypíše dočasné heslo (používateľ si ho po prihlásení musí zmeniť).
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./index');

const [, , emailArg, fullName = '', roleArg = 'user'] = process.argv;
if (!emailArg) {
  console.error('Použitie: node src/db/create-user.js <email> "<Cele meno>" [admin|user]');
  process.exit(1);
}
const email = emailArg.toLowerCase();
const role = roleArg === 'admin' ? 'admin' : 'user';

if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
  console.error('Používateľ už existuje: ' + email);
  process.exit(1);
}

const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const bytes = crypto.randomBytes(14);
let password = '';
for (let i = 0; i < 14; i++) password += chars[bytes[i] % chars.length];

db.prepare(
  'INSERT INTO users (email, password_hash, full_name, role, must_change_password) VALUES (?,?,?,?,1)'
).run(email, bcrypt.hashSync(password, 12), fullName, role);

console.log('Vytvorený používateľ:');
console.log('  E-mail: ' + email);
console.log('  Rola:   ' + role);
console.log('  Heslo:  ' + password + '  (dočasné – zmeniť po prihlásení)');

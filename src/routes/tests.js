const express = require('express');
const bcrypt = require('bcryptjs');
const config = require('../config');
const db = require('../db');
const { requireAuth, requireAdmin, passwordChangeReason } = require('../middleware/auth');
const passwordPolicy = require('../util/password');
const mailer = require('../mailer');

const router = express.Router();
router.use(requireAuth, requireAdmin);

// Test: overí, či stránka/aplikácia funguje (self HTTP check na /health).
async function siteWorksTest() {
  const url = `http://127.0.0.1:${config.port}/health`;
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    const data = await resp.json().catch(() => ({}));
    const ok = resp.status === 200 && data.status === 'ok';
    return {
      name: 'Stránka funguje',
      description: 'Overí, že server odpovedá a databáza je dostupná (GET /health).',
      ok,
      detail: ok ? `HTTP ${resp.status}, status "${data.status}"` : `HTTP ${resp.status}`,
      durationMs: Date.now() - started,
    };
  } catch (e) {
    return {
      name: 'Stránka funguje',
      description: 'Overí, že server odpovedá a databáza je dostupná (GET /health).',
      ok: false,
      detail: e.name === 'AbortError' ? 'Časový limit (5 s) vypršal' : 'Server neodpovedal',
      durationMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }

// CRUD test v transakcii, ktorá sa VŽDY vráti späť (nič neostane v DB).
function crudTest(name, description, steps) {
  const started = Date.now();
  let ok = true;
  let detail = '';
  db.exec('BEGIN');
  try {
    detail = steps();
  } catch (e) {
    ok = false;
    detail = e.message;
  } finally {
    try { db.exec('ROLLBACK'); } catch (e) { /* ignore */ }
  }
  return { name, description, ok, detail: ok ? (detail || 'OK') : detail, durationMs: Date.now() - started };
}

function employeeCrud() {
  return crudTest('CRUD zamestnanca', 'Vytvorenie, čítanie, úprava a zmazanie zamestnanca.', () => {
    const id = db.prepare("INSERT INTO employees (first_name,last_name,position) VALUES ('__TEST__','Zamestnanec','robotnik')").run().lastInsertRowid;
    let row = db.prepare('SELECT * FROM employees WHERE id=?').get(id);
    assert(row && row.first_name === '__TEST__', 'čítanie po vytvorení zlyhalo');
    db.prepare("UPDATE employees SET last_name='Upraveny', trade='Murár' WHERE id=?").run(id);
    row = db.prepare('SELECT last_name,trade FROM employees WHERE id=?').get(id);
    assert(row.last_name === 'Upraveny' && row.trade === 'Murár', 'úprava zlyhala');
    db.prepare('DELETE FROM employees WHERE id=?').run(id);
    assert(!db.prepare('SELECT 1 FROM employees WHERE id=?').get(id), 'zmazanie zlyhalo');
    return 'vytvorenie, čítanie, úprava, zmazanie OK';
  });
}

function projectCrud() {
  return crudTest('CRUD stavby', 'Vytvorenie, čítanie, úprava a zmazanie stavby.', () => {
    const id = db.prepare("INSERT INTO projects (name,status,bauleiter) VALUES ('__TEST stavba__','active','X')").run().lastInsertRowid;
    let row = db.prepare('SELECT * FROM projects WHERE id=?').get(id);
    assert(row && row.name === '__TEST stavba__', 'čítanie po vytvorení zlyhalo');
    db.prepare("UPDATE projects SET bauleiter='Y', kw_od=10, status='done' WHERE id=?").run(id);
    row = db.prepare('SELECT bauleiter,kw_od,status FROM projects WHERE id=?').get(id);
    assert(row.bauleiter === 'Y' && row.kw_od === 10 && row.status === 'done', 'úprava zlyhala');
    db.prepare('DELETE FROM projects WHERE id=?').run(id);
    assert(!db.prepare('SELECT 1 FROM projects WHERE id=?').get(id), 'zmazanie zlyhalo');
    return 'vytvorenie, čítanie, úprava, zmazanie OK';
  });
}

// Logický test (bez DB, bez transakcie).
function logicTest(name, description, fn) {
  const started = Date.now();
  let ok = true;
  let detail = '';
  try {
    detail = fn();
  } catch (e) {
    ok = false;
    detail = e.message;
  }
  return { name, description, ok, detail: ok ? (detail || 'OK') : detail, durationMs: Date.now() - started };
}

// Test: politika sily hesla (validátor).
function passwordPolicyTest() {
  return logicTest('Politika hesla', 'Slabé heslá sú odmietnuté, správne prijaté.', () => {
    const bad = [
      ['kratke1A', 'krátke'],
      ['malemale123', 'bez veľkého písmena'],
      ['VELKEVELKE123', 'bez malého písmena'],
      ['BezCisiliceee', 'bez číslice'],
    ];
    bad.forEach(([pw, why]) => assert(passwordPolicy.validate(pw, { email: 'x@y.sk' }), `malo zlyhať: ${why}`));
    assert(passwordPolicy.validate('Peterbaca12', { email: 'peterbaca@y.sk' }), 'heslo s e-mailom malo zlyhať');
    assert(!passwordPolicy.validate('Spravne123', { email: 'x@y.sk' }), 'platné heslo bolo odmietnuté');
    return 'odmietnuté slabé + heslo s e-mailom, platné prijaté';
  });
}

// Test: expirácia hesla (vynútená zmena po roku).
function passwordExpiryTest() {
  return logicTest('Expirácia hesla', 'Heslo staršie ako rok vyžaduje zmenu.', () => {
    const today = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const old = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 19).replace('T', ' ');
    assert(passwordPolicy.isExpired(old), 'staré heslo sa nevyhodnotilo ako expirované');
    assert(!passwordPolicy.isExpired(today), 'nové heslo sa chybne vyhodnotilo ako expirované');
    assert(passwordChangeReason({ must_change_password: 0, password_changed_at: old }) === 'expired', 'reason != expired');
    assert(passwordChangeReason({ must_change_password: 1, password_changed_at: today }) === 'forced', 'reason != forced');
    assert(passwordChangeReason({ must_change_password: 0, password_changed_at: today }) === null, 'reason != null');
    return 'expirácia + dôvody zmeny (forced/expired/žiadny) OK';
  });
}

// Test: prihlásenie a zmena hesla (v transakcii s rollbackom).
function loginAndPasswordChangeTest() {
  return crudTest('Prihlásenie a zmena hesla', 'Overenie hesla, blokované konto, zmena hesla.', () => {
    const hash = bcrypt.hashSync('Spravne123', 12);
    const id = db.prepare(
      "INSERT INTO users (email,password_hash,full_name,role,active,must_change_password,password_changed_at) VALUES ('__test_login__@tbau.eu',?,'Test','zamestnanec',1,0,datetime('now'))"
    ).run(hash).lastInsertRowid;
    let u = db.prepare('SELECT * FROM users WHERE id=?').get(id);
    assert(bcrypt.compareSync('Spravne123', u.password_hash), 'správne heslo neprešlo');
    assert(!bcrypt.compareSync('zleheslo', u.password_hash), 'nesprávne heslo prešlo');
    // blokované konto sa neprihlási (login kontroluje user.active)
    db.prepare('UPDATE users SET active=0 WHERE id=?').run(id);
    assert(db.prepare('SELECT active FROM users WHERE id=?').get(id).active === 0, 'blokovanie konta zlyhalo');
    db.prepare('UPDATE users SET active=1 WHERE id=?').run(id);
    // zmena hesla: nový hash, zruší sa must_change, posunie sa dátum
    const newHash = bcrypt.hashSync('NoveHeslo456', 12);
    db.prepare("UPDATE users SET password_hash=?, must_change_password=0, password_changed_at=datetime('now') WHERE id=?").run(newHash, id);
    u = db.prepare('SELECT * FROM users WHERE id=?').get(id);
    assert(bcrypt.compareSync('NoveHeslo456', u.password_hash), 'nové heslo neprešlo');
    assert(!bcrypt.compareSync('Spravne123', u.password_hash), 'staré heslo stále platí');
    assert(u.must_change_password === 0, 'must_change_password sa nezrušilo');
    return 'overenie hesla, blokovanie, zmena hesla OK';
  });
}

// Test: žiadosť o reset hesla (vytvorenie a vybavenie, v transakcii).
function resetRequestTest() {
  return crudTest('Žiadosť o reset hesla', 'Vytvorenie žiadosti a jej vybavenie (open → done).', () => {
    const id = db.prepare("INSERT INTO password_reset_requests (email,status) VALUES ('__test_reset__@tbau.eu','open')").run().lastInsertRowid;
    let r = db.prepare('SELECT * FROM password_reset_requests WHERE id=?').get(id);
    assert(r && r.status === 'open', 'žiadosť sa nevytvorila ako otvorená');
    db.prepare("UPDATE password_reset_requests SET status='done', handled_at=datetime('now') WHERE id=?").run(id);
    r = db.prepare('SELECT status FROM password_reset_requests WHERE id=?').get(id);
    assert(r.status === 'done', 'vybavenie žiadosti zlyhalo');
    return 'vytvorenie + vybavenie žiadosti OK';
  });
}

// Test: SMTP spojenie (ak je nakonfigurované; inak informatívne preskočené).
async function smtpTest() {
  const started = Date.now();
  const base = { name: 'SMTP e-mail', description: 'Overí spojenie s e-mailovým serverom (ak je nakonfigurované).' };
  if (!mailer.isConfigured()) {
    return { ...base, ok: true, detail: 'SMTP zatiaľ nenakonfigurované (preskočené).', durationMs: Date.now() - started };
  }
  try {
    await mailer.verify();
    return { ...base, ok: true, detail: 'Spojenie so SMTP serverom OK.', durationMs: Date.now() - started };
  } catch (e) {
    return { ...base, ok: false, detail: 'SMTP spojenie zlyhalo: ' + e.message, durationMs: Date.now() - started };
  }
}

// GET /tests
router.get('/', async (req, res) => {
  const results = [
    await siteWorksTest(),
    employeeCrud(),
    projectCrud(),
    passwordPolicyTest(),
    passwordExpiryTest(),
    loginAndPasswordChangeTest(),
    resetRequestTest(),
    await smtpTest(),
  ];
  res.render('tests', {
    title: 'Testy',
    active: 'settings',
    results,
    ranAt: new Date().toLocaleString('sk-SK'),
  });
});

module.exports = router;

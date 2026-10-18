const express = require('express');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const db = require('../db');
const config = require('../config');
const constants = require('../constants');
const perm = require('../permissions');
const dates = require('../util/dates');
const store = require('../settings-store');
const mailer = require('../mailer');
const pkg = require('../../package.json');
const { requireAuth, requireFullAccess } = require('../middleware/auth');

const router = express.Router();

// veľkosť + počet súborov v priečinku (rekurzívne)
function dirStats(dir) {
  let bytes = 0, files = 0;
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { const s = dirStats(full); bytes += s.bytes; files += s.files; }
      else { try { bytes += fs.statSync(full).size; files++; } catch (x) {} }
    }
  } catch (x) {}
  return { bytes, files };
}
function fmtMB(b) { return (b / 1048576).toFixed(1) + ' MB'; }

// Prehľad stavu zálohovania (číta adresár backups/ vytváraný denným timerom).
function backupStatus() {
  const base = process.env.BACKUP_DIR || path.join(__dirname, '..', '..', 'backups');
  const dir = path.join(base, 'db');
  try {
    const files = fs
      .readdirSync(dir)
      .filter((f) => /^tbau-.*\.db\.gz$/.test(f))
      .sort();
    if (!files.length) return { count: 0, last: null, lastSize: null };
    const last = files[files.length - 1];
    const st = fs.statSync(path.join(dir, last));
    return { count: files.length, last: st.mtime, lastSize: st.size };
  } catch (e) {
    return { count: 0, last: null, lastSize: null, error: true };
  }
}

// GET /nastavenia – rozcestník nastavení portálu (len plný prístup)
router.get('/nastavenia', requireAuth, requireFullAccess, (req, res) => {
  res.render('settings', {
    title: 'Nastavenia',
    active: 'settings',
    backup: backupStatus(),
    smtp: { configured: mailer.isConfigured(), from: store.getSmtp().from },
    items: [
      { label: 'Používatelia', href: '/users', icon: 'users', desc: 'Účty, role, reset hesla.' },
      { label: 'Aplikácie', href: '/apps', icon: 'grid', desc: 'Moduly portálu a ich stav.' },
      { label: 'Úlohy', href: '/tasks', icon: 'tasks', desc: 'Úlohy pri budovaní portálu.' },
      { label: 'Testy', href: '/tests', icon: 'beaker', desc: 'Automatické testy portálu.' },
      { label: 'Vykázaná práca', href: '/praca', icon: 'receipt', desc: 'Čas, tokeny a odhadovaná cena práce na projekte.' },
      { label: 'O systéme', href: '/nastavenia/system', icon: 'grid', desc: 'Technický prehľad: verzia, úložiská, zálohy, štatistiky.' },
    ],
  });
});

// GET /nastavenia/smtp – konfigurácia e-mailu (SMTP)
router.get('/nastavenia/smtp', requireAuth, requireFullAccess, (req, res) => {
  const c = store.getSmtp();
  res.render('smtp', {
    title: 'E-mail (SMTP)',
    active: 'settings',
    cfg: { host: c.host, port: c.port, secure: c.secure, user: c.user, from: c.from },
    passSet: !!c.pass,
    configured: mailer.isConfigured(),
    saved: req.query.saved === '1',
    testOk: req.query.test === 'ok',
    testTo: req.query.to ? decodeURIComponent(req.query.to) : null,
    testError: req.query.err ? decodeURIComponent(req.query.err) : null,
    myEmail: req.user.email,
  });
});

// POST /nastavenia/smtp – uloženie konfigurácie
router.post('/nastavenia/smtp', requireAuth, requireFullAccess, (req, res) => {
  store.set('smtp_host', (req.body.host || '').trim());
  store.set('smtp_port', (req.body.port || '587').trim());
  store.set('smtp_secure', req.body.secure ? '1' : '0');
  store.set('smtp_user', (req.body.user || '').trim());
  store.set('smtp_from', (req.body.from || '').trim());
  // heslo meníme iba ak bolo zadané (prázdne pole = ponechať pôvodné)
  if ((req.body.pass || '').length) store.set('smtp_pass', req.body.pass);
  res.redirect('/nastavenia/smtp?saved=1');
});

// POST /nastavenia/smtp/test – odoslanie testovacieho e-mailu na zadanú adresu
router.post('/nastavenia/smtp/test', requireAuth, requireFullAccess, async (req, res) => {
  const to = (req.body.to || req.user.email || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return res.redirect('/nastavenia/smtp?err=' + encodeURIComponent('Zadaj platnú e-mailovú adresu príjemcu.'));
  }
  try {
    await mailer.sendMail({
      to,
      subject: 'TBAU portál – testovací e-mail',
      text: 'Toto je testovací e-mail z portálu TBAU. Ak ho vidíš, SMTP je nastavené správne.',
    });
    res.redirect('/nastavenia/smtp?test=ok&to=' + encodeURIComponent(to));
  } catch (e) {
    res.redirect('/nastavenia/smtp?err=' + encodeURIComponent(e.message));
  }
});

// GET /majetok – rozcestník majetku spoločnosti (len plný prístup)
router.get('/majetok', requireAuth, requireFullAccess, (req, res) => {
  res.render('assets', {
    title: 'Majetok spoločnosti',
    active: 'assets',
    items: [
      { label: 'Vozidlá', href: '/vozidla', icon: 'truck', desc: 'Evidencia vozidiel, pridelenie vodičom a stavbám, doklady.',
        count: db.prepare('SELECT COUNT(*) c FROM vehicles WHERE active = 1').get().c },
    ],
  });
});

// GET /nastavenia/system – technický prehľad systému (len plný prístup)
router.get('/nastavenia/system', requireAuth, requireFullAccess, (req, res) => {
  let commit = null;
  try { commit = execSync('git rev-parse --short HEAD', { cwd: path.join(__dirname, '..', '..') }).toString().trim(); } catch (e) {}
  const uploadsDir = config.uploadsDir;
  const dbSize = (() => { try { return fs.statSync(config.dbPath).size; } catch (e) { return 0; } })();
  const up = {
    smenovky: dirStats(path.join(uploadsDir, 'smenovky')),
    references: dirStats(path.join(uploadsDir, 'references')),
    vehicles: dirStats(path.join(uploadsDir, 'vehicles')),
  };
  const count = (sql) => { try { return db.prepare(sql).get().c; } catch (e) { return '—'; } };
  res.render('system-info', {
    title: 'O systéme', active: 'settings',
    app: {
      name: constants.company.name, version: pkg.version, commit,
      node: process.version, env: config.env,
      domainPrimary: 'portal.tbau.eu', domainBackup: 'tbau.goodvision.sk',
      repo: 'github.com/goodvisionsvk/tbau',
    },
    storage: {
      dbPath: config.dbPath, dbSize, uploadsDir, up,
      uploadsTotal: up.smenovky.bytes + up.references.bytes + up.vehicles.bytes,
      smtp: mailer.isConfigured(),
    },
    backup: backupStatus(),
    counts: {
      users: count('SELECT COUNT(*) c FROM users'),
      employees: count('SELECT COUNT(*) c FROM employees'),
      customers: count('SELECT COUNT(*) c FROM customers'),
      contacts: count('SELECT COUNT(*) c FROM contacts'),
      projects: count('SELECT COUNT(*) c FROM projects'),
      vehicles: count('SELECT COUNT(*) c FROM vehicles'),
      inquiries: count('SELECT COUNT(*) c FROM inquiries'),
      references: count('SELECT COUNT(*) c FROM reference_sites'),
      leaves: count('SELECT COUNT(*) c FROM leaves'),
    },
    fmtMB,
  });
});

// GET /health – jednoduchý health check (pre testy a monitoring)
router.get('/health', (req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok', time: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ status: 'error', error: 'db' });
  }
});

// GET / – verejná úvodná stránka
router.get('/', (req, res) => {
  res.render('landing', { layout: 'layouts/public', title: 'Firemný portál' });
});

// GET /dashboard – prehľad po prihlásení (podľa role)
router.get('/dashboard', requireAuth, (req, res) => {
  const user = req.user;
  const full = perm.isFullAccess(user);
  const foreman = user.role === 'parcak';

  // zamestnanec nemá dashboard – ide rovno na svoju dochádzku
  if (!full && !foreman) return res.redirect('/moja-dochadzka');

  const now = new Date();
  const { start, end } = dates.monthRange(now.getUTCFullYear(), now.getUTCMonth() + 1);
  let cards = [];
  let recentRequests = [];

  if (full) {
    const employees = db.prepare('SELECT COUNT(*) c FROM employees WHERE active = 1').get().c;
    const projects = db.prepare("SELECT COUNT(*) c FROM projects WHERE status != 'done'").get().c;
    const openReq = db.prepare("SELECT COUNT(*) c FROM change_requests WHERE status = 'open'").get().c;
    const hours = db.prepare('SELECT COALESCE(SUM(hours),0) h FROM attendance WHERE work_date BETWEEN ? AND ?').get(start, end).h;
    cards = [
      { icon: 'hardhat', num: employees, label: 'Aktívni zamestnanci', href: '/zamestnanci' },
      { icon: 'building', num: projects, label: 'Aktívne stavby', href: '/projects' },
      { icon: 'clock', num: Math.round(hours), label: 'Hodiny tento mesiac', href: '/reporty' },
      { icon: 'inbox', num: openReq, label: 'Otvorené žiadosti', href: '/ziadosti' },
    ];
    recentRequests = db
      .prepare(
        `SELECT cr.*, e.first_name, e.last_name FROM change_requests cr
         JOIN employees e ON e.id = cr.employee_id
         WHERE cr.status = 'open' ORDER BY cr.created_at DESC LIMIT 5`
      )
      .all();
  } else {
    const projIds = perm.foremanProjectIds(user);
    let workers = 0, hours = 0, openReq = 0;
    if (projIds.length) {
      const ph = projIds.map(() => '?').join(',');
      workers = db.prepare(`SELECT COUNT(DISTINCT employee_id) c FROM site_members WHERE project_id IN (${ph})`).get(...projIds).c;
      hours = db.prepare(`SELECT COALESCE(SUM(hours),0) h FROM attendance WHERE project_id IN (${ph}) AND work_date BETWEEN ? AND ?`).get(...projIds, start, end).h;
      openReq = db.prepare(`SELECT COUNT(*) c FROM change_requests WHERE status='open' AND employee_id IN (SELECT employee_id FROM site_members WHERE project_id IN (${ph}))`).get(...projIds).c;
    }
    cards = [
      { icon: 'building', num: projIds.length, label: 'Moje stavby', href: '/projects' },
      { icon: 'users', num: workers, label: 'Ľudia na stavbách', href: '/dochadzka' },
      { icon: 'clock', num: Math.round(hours), label: 'Hodiny tento mesiac', href: '/reporty' },
      { icon: 'inbox', num: openReq, label: 'Otvorené žiadosti', href: '/ziadosti' },
    ];
  }

  const apps = db
    .prepare('SELECT * FROM apps ORDER BY sort_order, name')
    .all()
    .map((a) => ({ ...a, href: constants.appHref(a), iconName: constants.appIcon(a) }));
  res.render('dashboard', { title: 'Prehľad', active: 'dashboard', cards, recentRequests, apps, full });
});

module.exports = router;

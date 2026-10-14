const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const constants = require('../constants');
const perm = require('../permissions');
const dates = require('../util/dates');
const { requireAuth, requireFullAccess } = require('../middleware/auth');

const router = express.Router();

// Prehľad stavu zálohovania (číta adresár backups/ vytváraný denným timerom).
function backupStatus() {
  const dir = process.env.BACKUP_DIR || path.join(__dirname, '..', '..', 'backups');
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
    items: [
      { label: 'Používatelia', href: '/users', icon: 'users', desc: 'Účty, role, reset hesla.' },
      { label: 'Aplikácie', href: '/apps', icon: 'grid', desc: 'Moduly portálu a ich stav.' },
      { label: 'Úlohy', href: '/tasks', icon: 'tasks', desc: 'Úlohy pri budovaní portálu.' },
      { label: 'Testy', href: '/tests', icon: 'beaker', desc: 'Automatické testy portálu.' },
      { label: 'Vykázaná práca', href: '/praca', icon: 'receipt', desc: 'Čas, tokeny a odhadovaná cena práce na projekte.' },
    ],
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

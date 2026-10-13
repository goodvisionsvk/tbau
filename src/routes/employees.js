const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db');
const constants = require('../constants');
const { requireAuth, requireFullAccess } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireFullAccess);

function genPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(14);
  let out = '';
  for (let i = 0; i < 14; i++) out += chars[bytes[i] % chars.length];
  return out;
}

// pozícia + druh robotníka z formulára (druh len pre robotníka)
function parsePosition(body) {
  const position = Object.keys(constants.employeePositions).includes(body.position) ? body.position : null;
  const trade = position === 'robotnik' ? ((body.trade || '').trim() || null) : null;
  return { position, trade };
}

// zoznam zamestnancov s filtrami (stavba, pozícia, druh, hľadanie, archivovaní)
function listEmployees(f) {
  const where = [];
  const params = [];
  if (!f.archived) where.push('e.active = 1');
  else where.push('e.active = 0');
  if (f.stavba) { where.push('sm.project_id = ?'); params.push(Number(f.stavba)); }
  if (f.position) { where.push('e.position = ?'); params.push(f.position); }
  if (f.trade) { where.push('e.trade = ?'); params.push(f.trade); }
  if (f.q) {
    where.push('(e.first_name LIKE ? OR e.last_name LIKE ? OR e.employee_number LIKE ?)');
    const like = '%' + f.q + '%';
    params.push(like, like, like);
  }
  const sql =
    `SELECT DISTINCT e.*, u.email AS login_email, u.role AS login_role
     FROM employees e
     LEFT JOIN users u ON u.id = e.user_id
     LEFT JOIN site_members sm ON sm.employee_id = e.id
     WHERE ${where.join(' AND ')}
     ORDER BY e.last_name, e.first_name`;
  return db.prepare(sql).all(...params);
}

function projectsList() {
  return db.prepare('SELECT id, name FROM projects ORDER BY name').all();
}

// GET /zamestnanci – tabuľka + filtre
router.get('/', (req, res) => {
  const f = {
    q: (req.query.q || '').trim(),
    stavba: req.query.stavba || '',
    position: Object.keys(constants.employeePositions).includes(req.query.position) ? req.query.position : '',
    trade: req.query.trade || '',
    archived: req.query.archived === '1',
  };
  res.render('employees', {
    title: 'Zamestnanci',
    active: 'employees',
    employees: listEmployees(f),
    filter: f,
    projects: projectsList(),
    positions: constants.employeePositions,
    trades: constants.workerTrades,
  });
});

// GET /zamestnanci/novy – samostatná stránka na pridanie
router.get('/novy', (req, res) => {
  res.render('employee-new', {
    title: 'Nový zamestnanec',
    active: 'employees',
    positions: constants.employeePositions,
    trades: constants.workerTrades,
    error: null,
  });
});

// POST /zamestnanci – vytvorenie (z novej stránky)
router.post('/', (req, res) => {
  const first = (req.body.first_name || '').trim();
  const last = (req.body.last_name || '').trim();
  if (!first || !last) {
    return res.status(400).render('employee-new', {
      title: 'Nový zamestnanec', active: 'employees',
      positions: constants.employeePositions, trades: constants.workerTrades,
      error: 'Meno a priezvisko sú povinné.',
    });
  }
  const { position, trade } = parsePosition(req.body);
  const info = db.prepare(
    `INSERT INTO employees (first_name, last_name, employee_number, birth_date, phone, address, position, trade)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run(
    first, last,
    (req.body.employee_number || '').trim() || null,
    (req.body.birth_date || '').trim() || null,
    (req.body.phone || '').trim() || null,
    (req.body.address || '').trim() || null,
    position, trade
  );
  res.redirect('/zamestnanci/' + info.lastInsertRowid);
});

function detailData(id) {
  const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
  if (!employee) return null;
  const login = employee.user_id
    ? db.prepare('SELECT id, email, role, active FROM users WHERE id = ?').get(employee.user_id)
    : null;
  const sites = db
    .prepare(
      `SELECT p.id, p.name, sm.is_foreman FROM site_members sm
       JOIN projects p ON p.id = sm.project_id WHERE sm.employee_id = ? ORDER BY p.name`
    )
    .all(id);
  return { employee, login, sites };
}

function renderDetail(res, status, id, extra) {
  const d = detailData(id);
  if (!d) return res.redirect('/zamestnanci');
  res.status(status).render('employee-detail', Object.assign({
    title: d.employee.first_name + ' ' + d.employee.last_name,
    active: 'employees', employee: d.employee, login: d.login, sites: d.sites,
    roles: constants.roles, positions: constants.employeePositions, trades: constants.workerTrades,
    tempInfo: null, error: null,
  }, extra));
}

// GET /zamestnanci/:id – detail / úprava
router.get('/:id', (req, res) => renderDetail(res, 200, req.params.id, {}));

// POST /zamestnanci/:id – úprava údajov
router.post('/:id', (req, res) => {
  const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  if (!employee) return res.redirect('/zamestnanci');
  const first = (req.body.first_name || '').trim();
  const last = (req.body.last_name || '').trim();
  if (!first || !last) return renderDetail(res, 400, employee.id, { error: 'Meno a priezvisko sú povinné.' });
  const { position, trade } = parsePosition(req.body);
  db.prepare(
    `UPDATE employees SET first_name=?, last_name=?, employee_number=?, birth_date=?, phone=?, address=?, position=?, trade=?
     WHERE id=?`
  ).run(
    first, last,
    (req.body.employee_number || '').trim() || null,
    (req.body.birth_date || '').trim() || null,
    (req.body.phone || '').trim() || null,
    (req.body.address || '').trim() || null,
    position, trade,
    employee.id
  );
  res.redirect('/zamestnanci/' + employee.id);
});

// POST /zamestnanci/:id/archive – archivovať / obnoviť (soft)
router.post('/:id/archive', (req, res) => {
  db.prepare('UPDATE employees SET active = 1 - active WHERE id = ?').run(req.params.id);
  res.redirect(req.body.back === 'detail' ? '/zamestnanci/' + req.params.id : '/zamestnanci');
});

// POST /zamestnanci/:id/delete – úplné zmazanie (vrátane dochádzky, priradení)
router.post('/:id/delete', (req, res) => {
  db.prepare('DELETE FROM employees WHERE id = ?').run(req.params.id);
  res.redirect('/zamestnanci');
});

// POST /zamestnanci/:id/login – vytvorenie prihlásenia pre zamestnanca
router.post('/:id/login', (req, res) => {
  const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  if (!employee) return res.redirect('/zamestnanci');
  if (employee.user_id) return renderDetail(res, 400, employee.id, { error: 'Zamestnanec už má prihlásenie.' });

  const email = (req.body.email || '').trim().toLowerCase();
  const role = ['zamestnanec', 'parcak'].includes(req.body.role) ? req.body.role : 'zamestnanec';
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return renderDetail(res, 400, employee.id, { error: 'Zadaj platný e-mail pre prihlásenie.' });
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email))
    return renderDetail(res, 400, employee.id, { error: 'Používateľ s týmto e-mailom už existuje.' });

  const tempPassword = genPassword();
  const info = db.prepare(
    'INSERT INTO users (email, password_hash, full_name, role, must_change_password) VALUES (?,?,?,?,1)'
  ).run(email, bcrypt.hashSync(tempPassword, 12), employee.first_name + ' ' + employee.last_name, role);
  db.prepare('UPDATE employees SET user_id = ? WHERE id = ?').run(info.lastInsertRowid, employee.id);

  renderDetail(res, 200, employee.id, { tempInfo: { email, password: tempPassword, role } });
});

module.exports = router;

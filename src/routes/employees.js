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

function listEmployees() {
  return db
    .prepare(
      `SELECT e.*, u.email AS login_email, u.role AS login_role
       FROM employees e LEFT JOIN users u ON u.id = e.user_id
       ORDER BY e.active DESC, e.last_name, e.first_name`
    )
    .all();
}

// GET /zamestnanci
router.get('/', (req, res) => {
  res.render('employees', {
    title: 'Zamestnanci',
    active: 'employees',
    employees: listEmployees(),
    error: null,
  });
});

// POST /zamestnanci – nový zamestnanec
router.post('/', (req, res) => {
  const first = (req.body.first_name || '').trim();
  const last = (req.body.last_name || '').trim();
  if (!first || !last) {
    return res.status(400).render('employees', {
      title: 'Zamestnanci', active: 'employees', employees: listEmployees(),
      error: 'Meno a priezvisko sú povinné.',
    });
  }
  db.prepare(
    `INSERT INTO employees (first_name, last_name, employee_number, birth_date, phone, address)
     VALUES (?,?,?,?,?,?)`
  ).run(
    first, last,
    (req.body.employee_number || '').trim() || null,
    (req.body.birth_date || '').trim() || null,
    (req.body.phone || '').trim() || null,
    (req.body.address || '').trim() || null
  );
  res.redirect('/zamestnanci');
});

// GET /zamestnanci/:id – detail / úprava
router.get('/:id', (req, res) => {
  const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  if (!employee) return res.redirect('/zamestnanci');
  const login = employee.user_id
    ? db.prepare('SELECT id, email, role, active FROM users WHERE id = ?').get(employee.user_id)
    : null;
  const sites = db
    .prepare(
      `SELECT p.id, p.name, sm.is_foreman FROM site_members sm
       JOIN projects p ON p.id = sm.project_id WHERE sm.employee_id = ? ORDER BY p.name`
    )
    .all(employee.id);
  res.render('employee-detail', {
    title: employee.first_name + ' ' + employee.last_name,
    active: 'employees',
    employee, login, sites,
    roles: constants.roles,
    tempInfo: null,
    error: null,
  });
});

function renderDetail(res, status, id, extra) {
  const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
  const login = employee && employee.user_id
    ? db.prepare('SELECT id, email, role, active FROM users WHERE id = ?').get(employee.user_id)
    : null;
  const sites = db
    .prepare(
      `SELECT p.id, p.name, sm.is_foreman FROM site_members sm
       JOIN projects p ON p.id = sm.project_id WHERE sm.employee_id = ? ORDER BY p.name`
    )
    .all(id);
  res.status(status).render('employee-detail', Object.assign({
    title: employee.first_name + ' ' + employee.last_name,
    active: 'employees', employee, login, sites, roles: constants.roles,
    tempInfo: null, error: null,
  }, extra));
}

// POST /zamestnanci/:id – úprava údajov
router.post('/:id', (req, res) => {
  const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  if (!employee) return res.redirect('/zamestnanci');
  const first = (req.body.first_name || '').trim();
  const last = (req.body.last_name || '').trim();
  if (!first || !last) return renderDetail(res, 400, employee.id, { error: 'Meno a priezvisko sú povinné.' });
  db.prepare(
    `UPDATE employees SET first_name=?, last_name=?, employee_number=?, birth_date=?, phone=?, address=?, active=?
     WHERE id=?`
  ).run(
    first, last,
    (req.body.employee_number || '').trim() || null,
    (req.body.birth_date || '').trim() || null,
    (req.body.phone || '').trim() || null,
    (req.body.address || '').trim() || null,
    req.body.active ? 1 : 0,
    employee.id
  );
  res.redirect('/zamestnanci/' + employee.id);
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

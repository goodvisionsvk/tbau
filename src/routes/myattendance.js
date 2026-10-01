const express = require('express');
const db = require('../db');
const dates = require('../util/dates');
const perm = require('../permissions');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function monthData(employeeId, year, month) {
  const { start, end } = dates.monthRange(year, month);
  const rows = db
    .prepare(
      `SELECT a.work_date, a.hours, a.note, p.name AS project_name, p.id AS project_id
       FROM attendance a JOIN projects p ON p.id = a.project_id
       WHERE a.employee_id = ? AND a.work_date BETWEEN ? AND ?
       ORDER BY a.work_date`
    )
    .all(employeeId, start, end);
  const total = rows.reduce((s, r) => s + r.hours, 0);
  const byProject = {};
  rows.forEach((r) => (byProject[r.project_name] = (byProject[r.project_name] || 0) + r.hours));
  return { rows, total, byProject };
}

function myProjects(employeeId) {
  return db
    .prepare(
      `SELECT p.id, p.name FROM site_members sm JOIN projects p ON p.id = sm.project_id
       WHERE sm.employee_id = ? ORDER BY p.name`
    )
    .all(employeeId);
}

function myRequests(employeeId) {
  return db
    .prepare('SELECT * FROM change_requests WHERE employee_id = ? ORDER BY created_at DESC LIMIT 30')
    .all(employeeId);
}

// GET /moja-dochadzka
router.get('/', (req, res) => {
  const employee = perm.employeeForUser(req.user);
  if (!employee) {
    return res.render('my-attendance', {
      title: 'Moja dochádzka', active: 'myattendance', employee: null,
      month: {}, requests: [], projects: [], error: null, sent: false,
    });
  }
  const now = new Date();
  const year = req.query.year ? Number(req.query.year) : now.getUTCFullYear();
  const month = req.query.month ? Number(req.query.month) : now.getUTCMonth() + 1;
  res.render('my-attendance', {
    title: 'Moja dochádzka', active: 'myattendance',
    employee,
    month: Object.assign({ year, month, name: dates.monthName(month) }, monthData(employee.id, year, month)),
    projects: myProjects(employee.id),
    requests: myRequests(employee.id),
    error: null,
    sent: req.query.sent === '1',
  });
});

// POST /moja-dochadzka/ziadost – nová žiadosť o zmenu (ide na parťáka/administratívu)
router.post('/ziadost', (req, res) => {
  const employee = perm.employeeForUser(req.user);
  if (!employee) return res.redirect('/moja-dochadzka');
  const message = (req.body.message || '').trim();
  if (!message) return res.redirect('/moja-dochadzka');
  let hours = req.body.requested_hours ? parseFloat(String(req.body.requested_hours).replace(',', '.')) : null;
  if (!Number.isFinite(hours)) hours = null;
  db.prepare(
    `INSERT INTO change_requests (employee_id, project_id, work_date, requested_hours, message, created_by)
     VALUES (?,?,?,?,?,?)`
  ).run(
    employee.id,
    req.body.project_id ? Number(req.body.project_id) : null,
    (req.body.work_date || '').trim() || null,
    hours,
    message,
    req.user.id
  );
  res.redirect('/moja-dochadzka?sent=1');
});

module.exports = router;

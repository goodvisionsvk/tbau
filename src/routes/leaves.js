const express = require('express');
const db = require('../db');
const constants = require('../constants');
const { requireAuth, requireFullAccess } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireFullAccess);

const S = (v) => ((v || '').trim() || null);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

// počet pracovných dní (Po–Pi) medzi dvoma dátumami vrátane
function workingDays(from, to) {
  const a = new Date(from + 'T00:00:00Z'), b = new Date(to + 'T00:00:00Z');
  if (isNaN(a) || isNaN(b) || b < a) return 0;
  let n = 0;
  for (let d = new Date(a); d <= b; d.setUTCDate(d.getUTCDate() + 1)) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}

function employeesList() {
  return db.prepare("SELECT id, first_name, last_name FROM employees WHERE active = 1 ORDER BY last_name, first_name").all();
}

// GET /dovolenky – zoznam + filtre + ročný súhrn
router.get('/', (req, res) => {
  const now = new Date();
  const f = {
    year: req.query.year || String(now.getFullYear()),
    employee: req.query.employee || '',
    status: req.query.status || '',
    type: req.query.type || '',
  };
  const where = ['substr(l.date_from,1,4) = ?'];
  const params = [f.year];
  if (f.employee) { where.push('l.employee_id = ?'); params.push(Number(f.employee)); }
  if (f.status) { where.push('l.status = ?'); params.push(f.status); }
  if (f.type) { where.push('l.leave_type = ?'); params.push(f.type); }
  const rows = db.prepare(
    `SELECT l.*, e.first_name, e.last_name FROM leaves l JOIN employees e ON e.id = l.employee_id
     WHERE ${where.join(' AND ')} ORDER BY l.date_from DESC`
  ).all(...params);
  // súhrn schválenej dovolenky podľa zamestnanca (len typ Dovolenka, stav approved) v danom roku
  const summary = db.prepare(
    `SELECT e.id, e.first_name, e.last_name, SUM(l.days) AS days
     FROM leaves l JOIN employees e ON e.id = l.employee_id
     WHERE substr(l.date_from,1,4) = ? AND l.status = 'approved' AND l.leave_type = 'Dovolenka'
     GROUP BY e.id ORDER BY days DESC`
  ).all(f.year);
  const years = [];
  for (let y = now.getFullYear() + 1; y >= now.getFullYear() - 3; y--) years.push(String(y));
  res.render('leaves', {
    title: 'Dovolenky', active: 'leaves', leaves: rows, summary, filter: f, years,
    employees: employeesList(), types: constants.leaveTypes,
    statuses: constants.leaveStatuses, statusClass: constants.leaveStatusClass,
  });
});

// GET /dovolenky/nova
router.get('/nova', (req, res) => {
  res.render('leave-new', {
    title: 'Nová dovolenka', active: 'leaves', error: null,
    employees: employeesList(), types: constants.leaveTypes,
    preEmp: req.query.employee ? Number(req.query.employee) : null,
  });
});

// POST /dovolenky – vytvorenie
router.post('/', (req, res) => {
  const employee_id = Number(req.body.employee_id);
  const leave_type = constants.leaveTypes.includes(req.body.leave_type) ? req.body.leave_type : 'Dovolenka';
  const from = S(req.body.date_from), to = S(req.body.date_to);
  const err = (m) => res.status(400).render('leave-new', {
    title: 'Nová dovolenka', active: 'leaves', error: m,
    employees: employeesList(), types: constants.leaveTypes, preEmp: employee_id || null,
  });
  if (!employee_id || !db.prepare('SELECT 1 FROM employees WHERE id = ?').get(employee_id)) return err('Vyber zamestnanca.');
  if (!from || !to || !ISO.test(from) || !ISO.test(to)) return err('Zadaj platný dátum od a do.');
  if (to < from) return err('Dátum „do" nemôže byť pred „od".');
  const days = req.body.days ? parseFloat(req.body.days) : workingDays(from, to);
  const info = db.prepare(
    `INSERT INTO leaves (employee_id, leave_type, date_from, date_to, days, note, created_by)
     VALUES (?,?,?,?,?,?,?)`
  ).run(employee_id, leave_type, from, to, days, S(req.body.note), req.user.id);
  res.redirect('/dovolenky/' + info.lastInsertRowid);
});

function renderDetail(res, id, user, extra = {}) {
  const l = db.prepare(
    `SELECT l.*, e.first_name, e.last_name,
       ap.full_name AS approver_name
     FROM leaves l JOIN employees e ON e.id = l.employee_id
     LEFT JOIN users ap ON ap.id = l.approved_by WHERE l.id = ?`
  ).get(id);
  if (!l) return res.redirect('/dovolenky');
  res.render('leave-detail', Object.assign({
    title: 'Dovolenka – ' + l.last_name + ' ' + l.first_name, active: 'leaves', l,
    employees: employeesList(), types: constants.leaveTypes,
    statuses: constants.leaveStatuses, statusClass: constants.leaveStatusClass,
    error: null, saved: false,
  }, extra));
}

// GET /dovolenky/:id
router.get('/:id', (req, res) => renderDetail(res, req.params.id, req.user, { saved: req.query.saved === '1' }));

// POST /dovolenky/:id – úprava
router.post('/:id', (req, res) => {
  const l = db.prepare('SELECT * FROM leaves WHERE id = ?').get(req.params.id);
  if (!l) return res.redirect('/dovolenky');
  const leave_type = constants.leaveTypes.includes(req.body.leave_type) ? req.body.leave_type : l.leave_type;
  const from = S(req.body.date_from) || l.date_from, to = S(req.body.date_to) || l.date_to;
  if (to < from) return renderDetail(res, req.params.id, req.user, { error: 'Dátum „do" nemôže byť pred „od".' });
  const days = req.body.days ? parseFloat(req.body.days) : workingDays(from, to);
  db.prepare('UPDATE leaves SET leave_type=?, date_from=?, date_to=?, days=?, note=? WHERE id=?')
    .run(leave_type, from, to, days, S(req.body.note), l.id);
  res.redirect('/dovolenky/' + l.id + '?saved=1');
});

// POST /dovolenky/:id/status – schválenie/zamietnutie
router.post('/:id/status', (req, res) => {
  const st = ['pending', 'approved', 'rejected'].includes(req.body.status) ? req.body.status : null;
  if (st) {
    db.prepare("UPDATE leaves SET status=?, approved_by=?, approved_at=datetime('now') WHERE id=?")
      .run(st, req.user.id, req.params.id);
  }
  res.redirect('/dovolenky/' + req.params.id);
});

// POST /dovolenky/:id/delete
router.post('/:id/delete', (req, res) => {
  db.prepare('DELETE FROM leaves WHERE id = ?').run(req.params.id);
  res.redirect('/dovolenky');
});

module.exports = router;

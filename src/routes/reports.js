const express = require('express');
const db = require('../db');
const dates = require('../util/dates');
const perm = require('../permissions');
const { requireAuth, requireStaff } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireStaff);

// Report za mesiac: súčet hodín na zamestnanca (voliteľne obmedzené na stavby parťáka).
function monthlyReport(user, year, month) {
  const { start, end } = dates.monthRange(year, month);
  let projFilter = '';
  const params = [start, end];
  if (!perm.isFullAccess(user)) {
    const ids = perm.foremanProjectIds(user);
    if (!ids.length) return { employees: [], byProject: [] };
    projFilter = ` AND a.project_id IN (${ids.map(() => '?').join(',')})`;
    params.push(...ids);
  }
  const employees = db
    .prepare(
      `SELECT e.id, e.first_name, e.last_name, e.employee_number,
              SUM(a.hours) AS total, COUNT(DISTINCT a.work_date) AS days
       FROM attendance a JOIN employees e ON e.id = a.employee_id
       WHERE a.work_date BETWEEN ? AND ?${projFilter}
       GROUP BY e.id ORDER BY e.last_name, e.first_name`
    )
    .all(...params);
  const byProject = db
    .prepare(
      `SELECT p.name AS project_name, SUM(a.hours) AS total, COUNT(DISTINCT a.employee_id) AS people
       FROM attendance a JOIN projects p ON p.id = a.project_id
       WHERE a.work_date BETWEEN ? AND ?${projFilter}
       GROUP BY p.id ORDER BY total DESC`
    )
    .all(...params);
  return { employees, byProject };
}

// GET /reporty
router.get('/', (req, res) => {
  const now = new Date();
  const year = req.query.year ? Number(req.query.year) : now.getUTCFullYear();
  const month = req.query.month ? Number(req.query.month) : now.getUTCMonth() + 1;
  const data = monthlyReport(req.user, year, month);
  res.render('reports', {
    title: 'Reporty dochádzky',
    active: 'reports',
    year, month, monthName: dates.monthName(month),
    employees: data.employees,
    byProject: data.byProject,
    totalHours: data.employees.reduce((s, e) => s + (e.total || 0), 0),
  });
});

// GET /reporty/export?year&month – CSV pre Excel
router.get('/export', (req, res) => {
  const now = new Date();
  const year = req.query.year ? Number(req.query.year) : now.getUTCFullYear();
  const month = req.query.month ? Number(req.query.month) : now.getUTCMonth() + 1;
  const { employees } = monthlyReport(req.user, year, month);

  const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const lines = [['Priezvisko', 'Meno', 'Osobné číslo', 'Hodiny spolu', 'Odpracované dni'].map(esc).join(';')];
  employees.forEach((e) =>
    lines.push([e.last_name, e.first_name, e.employee_number || '', (e.total || 0), e.days || 0].map(esc).join(';'))
  );
  const csv = '﻿' + lines.join('\r\n'); // BOM pre správne kódovanie v Exceli

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="report-dochadzka-${year}-${String(month).padStart(2, '0')}.csv"`);
  res.send(csv);
});

module.exports = router;

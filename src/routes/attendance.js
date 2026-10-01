const fs = require('fs');
const express = require('express');
const db = require('../db');
const dates = require('../util/dates');
const perm = require('../permissions');
const { requireAuth, requireStaff } = require('../middleware/auth');
const { uploadSheet } = require('../upload');
const { verifyCsrf } = require('../middleware/csrf');

const router = express.Router();
router.use(requireAuth, requireStaff);

// výber projektu + týždňa a zostavenie mriežky
function loadGrid(user, query) {
  const projects = perm.accessibleProjects(user);
  const cur = dates.currentIsoWeek();
  let projectId = query.project ? Number(query.project) : (projects[0] && projects[0].id);
  if (projectId && !perm.canAccessProject(user, projectId)) projectId = projects[0] && projects[0].id;
  const year = query.year ? Number(query.year) : cur.year;
  const week = query.week ? Number(query.week) : cur.week;

  const project = projectId ? db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) : null;
  const days = dates.weekDates(year, week);
  let rows = [];
  let sheets = [];
  if (project) {
    const members = db
      .prepare(
        `SELECT e.id, e.first_name, e.last_name, e.employee_number FROM site_members sm
         JOIN employees e ON e.id = sm.employee_id
         WHERE sm.project_id = ? AND e.active = 1
         ORDER BY e.last_name, e.first_name`
      )
      .all(project.id);
    const getHours = db.prepare(
      'SELECT work_date, hours FROM attendance WHERE employee_id = ? AND project_id = ? AND work_date BETWEEN ? AND ?'
    );
    rows = members.map((m) => {
      const map = {};
      getHours.all(m.id, project.id, days[0].date, days[6].date).forEach((r) => (map[r.work_date] = r.hours));
      const total = days.reduce((s, d) => s + (map[d.date] || 0), 0);
      return { employee: m, hours: map, total };
    });
    sheets = db
      .prepare('SELECT * FROM shift_sheets WHERE project_id = ? AND year = ? AND week = ? ORDER BY uploaded_at DESC')
      .all(project.id, year, week);
  }
  return { projects, project, year, week, days, rows, sheets };
}

// GET /dochadzka
router.get('/', (req, res) => {
  const data = loadGrid(req.user, req.query);
  res.render('attendance', Object.assign({ title: 'Dochádzka', active: 'attendance', error: null, saved: req.query.saved === '1' }, data));
});

// POST /dochadzka/save – uloženie mriežky hodín
router.post('/save', (req, res) => {
  const projectId = Number(req.body.project);
  const year = Number(req.body.year);
  const week = Number(req.body.week);
  if (!perm.canAccessProject(req.user, projectId)) {
    return res.status(403).render('error', { title: 'Prístup zamietnutý', message: 'Nemáš prístup k tejto stavbe.' });
  }
  const upsert = db.prepare(
    `INSERT INTO attendance (employee_id, project_id, work_date, hours, created_by, updated_at)
     VALUES (?,?,?,?,?,datetime('now'))
     ON CONFLICT(employee_id, project_id, work_date)
     DO UPDATE SET hours = excluded.hours, updated_at = datetime('now')`
  );
  const del = db.prepare('DELETE FROM attendance WHERE employee_id = ? AND project_id = ? AND work_date = ?');

  const tx = db.transaction((entries) => {
    for (const e of entries) {
      if (e.hours > 0) upsert.run(e.employeeId, projectId, e.date, e.hours, req.user.id);
      else del.run(e.employeeId, projectId, e.date);
    }
  });

  const entries = [];
  for (const key of Object.keys(req.body)) {
    const m = key.match(/^h_(\d+)_(\d{4}-\d{2}-\d{2})$/);
    if (!m) continue;
    let h = parseFloat(String(req.body[key]).replace(',', '.'));
    if (!Number.isFinite(h) || h < 0) h = 0;
    if (h > 24) h = 24;
    entries.push({ employeeId: Number(m[1]), date: m[2], hours: h });
  }
  tx(entries);
  res.redirect(`/dochadzka?project=${projectId}&year=${year}&week=${week}&saved=1`);
});

// POST /dochadzka/smenovka – nahratie smenovky (multipart)
router.post('/smenovka', (req, res) => {
  uploadSheet(req, res, (err) => {
    if (!verifyCsrf(req)) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(403).render('error', { title: 'Neplatný token', message: 'Formulár vypršal, skús znova.' });
    }
    const projectId = Number(req.body.project);
    const year = Number(req.body.year);
    const week = Number(req.body.week);
    const back = `/dochadzka?project=${projectId}&year=${year}&week=${week}`;
    if (!perm.canAccessProject(req.user, projectId)) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(403).render('error', { title: 'Prístup zamietnutý', message: 'Nemáš prístup k tejto stavbe.' });
    }
    if (err) {
      const data = loadGrid(req.user, req.body);
      return res.status(400).render('attendance', Object.assign({ title: 'Dochádzka', active: 'attendance', error: err.message, saved: false }, data));
    }
    if (!req.file) return res.redirect(back);
    db.prepare(
      `INSERT INTO shift_sheets (project_id, year, week, file_path, original_name, mime, size, note, uploaded_by)
       VALUES (?,?,?,?,?,?,?,?,?)`
    ).run(
      projectId, year, week, req.file.path, req.file.originalname, req.file.mimetype, req.file.size,
      (req.body.note || '').trim() || null, req.user.id
    );
    res.redirect(back);
  });
});

// GET /dochadzka/smenovka/:id/subor – zobrazenie/stiahnutie dokumentu
router.get('/smenovka/:id/subor', (req, res) => {
  const sheet = db.prepare('SELECT * FROM shift_sheets WHERE id = ?').get(req.params.id);
  if (!sheet || !perm.canAccessProject(req.user, sheet.project_id)) {
    return res.status(404).render('error', { title: 'Nenájdené', message: 'Dokument neexistuje.' });
  }
  if (!sheet.file_path || !fs.existsSync(sheet.file_path)) {
    return res.status(404).render('error', { title: 'Nenájdené', message: 'Súbor sa nenašiel na disku.' });
  }
  res.setHeader('Content-Type', sheet.mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', 'inline; filename="' + encodeURIComponent(sheet.original_name || 'smenovka') + '"');
  fs.createReadStream(sheet.file_path).pipe(res);
});

// POST /dochadzka/smenovka/:id/delete
router.post('/smenovka/:id/delete', (req, res) => {
  const sheet = db.prepare('SELECT * FROM shift_sheets WHERE id = ?').get(req.params.id);
  if (sheet && perm.canAccessProject(req.user, sheet.project_id)) {
    if (sheet.file_path) fs.unlink(sheet.file_path, () => {});
    db.prepare('DELETE FROM shift_sheets WHERE id = ?').run(sheet.id);
    return res.redirect(`/dochadzka?project=${sheet.project_id}&year=${sheet.year}&week=${sheet.week}`);
  }
  res.redirect('/dochadzka');
});

module.exports = router;

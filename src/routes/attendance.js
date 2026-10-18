const fs = require('fs');
const path = require('path');
const express = require('express');
const db = require('../db');
const dates = require('../util/dates');
const perm = require('../permissions');
const ai = require('../ai');
const { requireAuth, requireStaff } = require('../middleware/auth');
const { uploadSheet, sheetsDir } = require('../upload');
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

// mesačný prehľad (read-only) pre vybranú stavbu
function loadMonthGrid(user, query) {
  const projects = perm.accessibleProjects(user);
  const now = new Date();
  let projectId = query.project ? Number(query.project) : (projects[0] && projects[0].id);
  if (projectId && !perm.canAccessProject(user, projectId)) projectId = projects[0] && projects[0].id;
  const year = query.year ? Number(query.year) : now.getUTCFullYear();
  const month = query.month ? Number(query.month) : now.getUTCMonth() + 1;

  const project = projectId ? db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) : null;
  const days = dates.monthDays(year, month);
  const { start, end } = dates.monthRange(year, month);
  let rows = [];
  let grand = 0;
  if (project) {
    const members = db
      .prepare(
        `SELECT e.id, e.first_name, e.last_name, e.employee_number FROM site_members sm
         JOIN employees e ON e.id = sm.employee_id
         WHERE sm.project_id = ? AND e.active = 1 ORDER BY e.last_name, e.first_name`
      )
      .all(project.id);
    const getHours = db.prepare(
      'SELECT work_date, hours FROM attendance WHERE employee_id = ? AND project_id = ? AND work_date BETWEEN ? AND ?'
    );
    rows = members.map((m) => {
      const map = {};
      getHours.all(m.id, project.id, start, end).forEach((r) => (map[r.work_date] = r.hours));
      const total = days.reduce((s, d) => s + (map[d.date] || 0), 0);
      grand += total;
      return { employee: m, hours: map, total };
    });
  }
  return { projects, project, year, month, monthName: dates.monthName(month), days, rows, grand };
}

// GET /dochadzka  (?view=week|month)
router.get('/', (req, res) => {
  const view = req.query.view === 'month' ? 'month' : 'week';
  const data = view === 'month' ? loadMonthGrid(req.user, req.query) : loadGrid(req.user, req.query);
  res.render('attendance', Object.assign({ title: 'Dochádzka', active: 'attendance', view, error: null, saved: req.query.saved === '1' }, data));
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
      return res.status(400).render('attendance', Object.assign({ title: 'Dochádzka', active: 'attendance', view: 'week', error: err.message, saved: false }, data));
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

// ---------------------------------------------------------------------------
//  Import smenovky cez AI (foto → prečítanie → kontrola/napárovanie → dochádzka)
// ---------------------------------------------------------------------------
const DAY_KEYS = ['po', 'ut', 'st', 'stv', 'pi', 'so', 'ne'];

function normTokens(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean);
}
function matchEmployee(aiName, employees) {
  const at = new Set(normTokens(aiName));
  // presná zhoda: priezvisko + meno (v ľubovoľnom poradí)
  for (const e of employees) {
    const need = normTokens(e.last_name).concat(normTokens(e.first_name));
    if (need.length && need.every((t) => at.has(t))) return e.id;
  }
  // aspoň priezvisko
  for (const e of employees) {
    const ln = normTokens(e.last_name);
    if (ln.length && ln.every((t) => at.has(t))) return e.id;
  }
  return null;
}
function matchProject(result, projects) {
  const h = normTokens((result.stavba || '') + ' ' + (result.firma || '')).join(' ');
  for (const p of projects) {
    const pn = normTokens(p.name).join(' ');
    if (pn && (h.includes(pn) || pn.split(' ').some((t) => t.length > 3 && h.includes(t)))) return p.id;
    const pc = normTokens(p.client || '').join(' ');
    if (pc && (h.includes(pc) || pc.split(' ').some((t) => t.length > 3 && h.includes(t)))) return p.id;
  }
  return null;
}

// GET /dochadzka/ai-import – úvod (nahratie fotky)
router.get('/ai-import', (req, res) => {
  res.render('ai-import', {
    title: 'Import smenovky (AI)', active: 'ai_import', error: null,
    aiReady: ai.isConfigured(),
  });
});

// POST /dochadzka/ai-import/read – nahraj foto a prečítaj (multipart)
router.post('/ai-import/read', (req, res) => {
  uploadSheet(req, res, async (err) => {
    if (!verifyCsrf(req)) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(403).render('error', { title: 'Neplatný token', message: 'Formulár vypršal, skús znova.' });
    }
    const fail = (m) => res.status(400).render('ai-import', { title: 'Import smenovky (AI)', active: 'ai_import', error: m, aiReady: ai.isConfigured() });
    if (err) return fail(err.message);
    if (!req.file) return fail('Vyber fotku smenovky.');
    try {
      const r = await ai.readSmenovka(req.file.path);
      const result = r.data || {};
      const projects = perm.accessibleProjects(req.user);
      const employees = db.prepare('SELECT id, first_name, last_name FROM employees WHERE active = 1 ORDER BY last_name, first_name').all();
      const matched = (result.pracovnici || []).map((p, i) => ({
        idx: i, meno: p.meno || '',
        empId: matchEmployee(p.meno, employees),
        hours: DAY_KEYS.map((k) => Number(p[k]) || 0),
        spolu: p.spolu,
      }));
      const cur = dates.currentIsoWeek();
      const week = result.kw && result.kw > 0 && result.kw <= 53 ? result.kw : cur.week;
      res.render('ai-import-review', {
        title: 'Import smenovky – kontrola', active: 'ai_import', result, matched, employees, projects,
        year: cur.year, week, projectId: matchProject(result, projects),
        days: dates.weekDates(cur.year, week),
        sheet: { file: path.basename(req.file.path), orig: req.file.originalname, mime: req.file.mimetype, size: req.file.size },
        meta: r.meta,
      });
    } catch (e) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return fail('Čítanie zlyhalo: ' + e.message);
    }
  });
});

// POST /dochadzka/ai-import/save – uloženie do dochádzky (+ smenovka ako doklad)
router.post('/ai-import/save', (req, res) => {
  const projectId = Number(req.body.project);
  const year = Number(req.body.year);
  const week = Number(req.body.week);
  if (!projectId || !perm.canAccessProject(req.user, projectId)) {
    return res.status(403).render('error', { title: 'Prístup zamietnutý', message: 'Vyber platnú stavbu, ku ktorej máš prístup.' });
  }
  const days = dates.weekDates(year, week);

  // smenovka ako doklad (ak foto ešte existuje)
  let sheetId = null;
  const sf = req.body.sheet_file ? path.basename(req.body.sheet_file) : null;
  if (sf) {
    const full = path.join(sheetsDir, sf);
    if (fs.existsSync(full)) {
      sheetId = db.prepare(
        `INSERT INTO shift_sheets (project_id, year, week, file_path, original_name, mime, size, note, uploaded_by)
         VALUES (?,?,?,?,?,?,?,?,?)`
      ).run(projectId, year, week, full, (req.body.sheet_orig || '').slice(0, 200) || null,
            (req.body.sheet_mime || '').slice(0, 100) || null, Number(req.body.sheet_size) || null,
            'Import cez AI', req.user.id).lastInsertRowid;
    }
  }

  const upsert = db.prepare(
    `INSERT INTO attendance (employee_id, project_id, work_date, hours, shift_sheet_id, created_by, updated_at)
     VALUES (?,?,?,?,?,?,datetime('now'))
     ON CONFLICT(employee_id, project_id, work_date)
     DO UPDATE SET hours = excluded.hours, shift_sheet_id = excluded.shift_sheet_id, updated_at = datetime('now')`
  );
  const del = db.prepare('DELETE FROM attendance WHERE employee_id = ? AND project_id = ? AND work_date = ?');

  const rowIdx = new Set();
  for (const k of Object.keys(req.body)) { const m = k.match(/^emp_(\d+)$/); if (m) rowIdx.add(Number(m[1])); }

  const tx = db.transaction(() => {
    let saved = 0;
    for (const i of rowIdx) {
      const empId = Number(req.body['emp_' + i]);
      if (!empId) continue;
      for (let j = 0; j < 7; j++) {
        let h = parseFloat(String(req.body['d' + j + '_' + i] || '0').replace(',', '.'));
        if (!Number.isFinite(h) || h < 0) h = 0;
        if (h > 24) h = 24;
        if (h > 0) upsert.run(empId, projectId, days[j].date, h, sheetId, req.user.id);
        else del.run(empId, projectId, days[j].date);
      }
      saved++;
    }
    return saved;
  });
  tx();
  res.redirect(`/dochadzka?project=${projectId}&year=${year}&week=${week}&saved=1`);
});

module.exports = router;

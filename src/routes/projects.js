const express = require('express');
const db = require('../db');
const perm = require('../permissions');
const dates = require('../util/dates');
const constants = require('../constants');
const { requireAuth, requireFullAccess } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const STATUSES = ['planned', 'active', 'paused', 'done'];
const S = (v) => ((v || '').trim() || null);
const num = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };

// pevné polia stavby z formulára
function projectFields(body) {
  const budget = body.budget ? parseFloat(String(body.budget).replace(',', '.')) : null;
  return {
    name: (body.name || '').trim(),
    code: S(body.code),
    client: S(body.client),
    address: S(body.address),
    budget: Number.isFinite(budget) ? budget : null,
    status: STATUSES.includes(body.status) ? body.status : 'planned',
    start_date: S(body.start_date),
    end_date: S(body.end_date),
    bauleiter: S(body.bauleiter),
    polier: S(body.polier),
    kw_od: num(body.kw_od),
    kw_do: num(body.kw_do),
    description: S(body.description),
  };
}

function listProjects(user, f) {
  const where = [];
  const params = [];
  if (!perm.isFullAccess(user)) {
    const ids = perm.foremanProjectIds(user);
    if (!ids.length) return [];
    where.push('id IN (' + ids.map(() => '?').join(',') + ')');
    params.push(...ids);
  }
  if (f.status && STATUSES.includes(f.status)) { where.push('status = ?'); params.push(f.status); }
  if (f.q) {
    where.push('(name LIKE ? OR code LIKE ? OR client LIKE ? OR address LIKE ?)');
    const l = '%' + f.q + '%';
    params.push(l, l, l, l);
  }
  const sql =
    'SELECT * FROM projects' + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY created_at DESC';
  return db.prepare(sql).all(...params);
}

// GET /projects – tabuľka + filter
router.get('/', (req, res) => {
  const f = {
    q: (req.query.q || '').trim(),
    status: STATUSES.includes(req.query.status) ? req.query.status : '',
  };
  res.render('projects', {
    title: 'Stavby',
    active: 'projects',
    projects: listProjects(req.user, f),
    filter: f,
    statuses: constants.projectStatuses,
    canManage: perm.isFullAccess(req.user),
  });
});

// GET /projects/novy – samostatná stránka na pridanie
router.get('/novy', requireFullAccess, (req, res) => {
  res.render('project-new', {
    title: 'Nová stavba', active: 'projects', statuses: constants.projectStatuses, error: null,
  });
});

// POST /projects – vytvorenie
router.post('/', requireFullAccess, (req, res) => {
  const p = projectFields(req.body);
  if (!p.name) {
    return res.status(400).render('project-new', {
      title: 'Nová stavba', active: 'projects', statuses: constants.projectStatuses,
      error: 'Názov stavby je povinný.',
    });
  }
  const info = db.prepare(
    `INSERT INTO projects (name, code, client, address, budget, status, start_date, end_date, bauleiter, polier, kw_od, kw_do, description, created_by)
     VALUES (@name,@code,@client,@address,@budget,@status,@start_date,@end_date,@bauleiter,@polier,@kw_od,@kw_do,@description,@created_by)`
  ).run(Object.assign(p, { created_by: req.user.id }));
  res.redirect('/projects/' + info.lastInsertRowid);
});

// GET /projects/:id – detail (parametre + ľudia + smenovky)
router.get('/:id', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.redirect('/projects');
  if (!perm.canAccessProject(req.user, project.id)) {
    return res.status(403).render('error', { title: 'Prístup zamietnutý', message: 'Nemáš prístup k tejto stavbe.' });
  }
  const members = db
    .prepare(
      `SELECT sm.id AS member_id, sm.is_foreman, e.id, e.first_name, e.last_name, e.employee_number
       FROM site_members sm JOIN employees e ON e.id = sm.employee_id
       WHERE sm.project_id = ? ORDER BY sm.is_foreman DESC, e.last_name, e.first_name`
    )
    .all(project.id);
  const memberIds = members.map((m) => m.id);
  const available = db
    .prepare('SELECT id, first_name, last_name, employee_number FROM employees WHERE active = 1 ORDER BY last_name, first_name')
    .all()
    .filter((e) => !memberIds.includes(e.id));
  const sheets = db
    .prepare('SELECT * FROM shift_sheets WHERE project_id = ? ORDER BY year DESC, week DESC, uploaded_at DESC LIMIT 20')
    .all(project.id);

  res.render('project-detail', {
    title: project.name,
    active: 'projects',
    project, members, available, sheets,
    statuses: constants.projectStatuses,
    canManageMembers: perm.canAccessProject(req.user, project.id),
    canManage: perm.isFullAccess(req.user),
    canAssignForeman: perm.isFullAccess(req.user),
    cur: dates.currentIsoWeek(),
    error: null,
  });
});

// POST /projects/:id – úprava parametrov (len plný prístup)
router.post('/:id', requireFullAccess, (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.redirect('/projects');
  const p = projectFields(req.body);
  if (!p.name) return res.redirect('/projects/' + project.id);
  db.prepare(
    `UPDATE projects SET name=@name, code=@code, client=@client, address=@address, budget=@budget,
       status=@status, start_date=@start_date, end_date=@end_date, bauleiter=@bauleiter, polier=@polier,
       kw_od=@kw_od, kw_do=@kw_do, description=@description WHERE id=@id`
  ).run(Object.assign(p, { id: project.id }));
  res.redirect('/projects/' + project.id);
});

// POST /projects/:id/members – pridať zamestnanca na stavbu
router.post('/:id/members', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project || !perm.canAccessProject(req.user, project.id)) {
    return res.status(403).render('error', { title: 'Prístup zamietnutý', message: 'Nemáš prístup k tejto stavbe.' });
  }
  const employeeId = Number(req.body.employee_id);
  const isForeman = req.body.is_foreman && perm.isFullAccess(req.user) ? 1 : 0;
  if (employeeId) {
    db.prepare('INSERT OR IGNORE INTO site_members (project_id, employee_id, is_foreman) VALUES (?,?,?)')
      .run(project.id, employeeId, isForeman);
  }
  res.redirect('/projects/' + project.id);
});

// POST /projects/:id/members/:mid/foreman – prepnúť parťáka (len plný prístup)
router.post('/:id/members/:mid/foreman', requireFullAccess, (req, res) => {
  db.prepare('UPDATE site_members SET is_foreman = 1 - is_foreman WHERE id = ? AND project_id = ?')
    .run(req.params.mid, req.params.id);
  res.redirect('/projects/' + req.params.id);
});

// POST /projects/:id/members/:mid/remove
router.post('/:id/members/:mid/remove', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (project && perm.canAccessProject(req.user, project.id)) {
    db.prepare('DELETE FROM site_members WHERE id = ? AND project_id = ?').run(req.params.mid, project.id);
  }
  res.redirect('/projects/' + req.params.id);
});

// POST /projects/:id/delete (len plný prístup)
router.post('/:id/delete', requireFullAccess, (req, res) => {
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  res.redirect('/projects');
});

module.exports = router;

const express = require('express');
const db = require('../db');
const perm = require('../permissions');
const dates = require('../util/dates');
const { requireAuth, requireFullAccess } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const STATUSES = ['planned', 'active', 'paused', 'done'];

// GET /projects (Stavby)
router.get('/', (req, res) => {
  const projects = perm.isFullAccess(req.user)
    ? db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all()
    : perm.accessibleProjects(req.user);
  res.render('projects', {
    title: 'Stavby',
    active: 'projects',
    projects,
    canManage: perm.isFullAccess(req.user),
    error: null,
  });
});

// POST /projects – vytvorenie stavby (len plný prístup)
router.post('/', requireFullAccess, (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) {
    const projects = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
    return res.status(400).render('projects', {
      title: 'Stavby', active: 'projects', projects, canManage: true, error: 'Názov stavby je povinný.',
    });
  }
  const status = STATUSES.includes(req.body.status) ? req.body.status : 'planned';
  const budget = req.body.budget ? parseFloat(String(req.body.budget).replace(',', '.')) : null;
  db.prepare(
    `INSERT INTO projects (name, code, client, address, budget, status, start_date, end_date, description, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).run(
    name,
    (req.body.code || '').trim() || null,
    (req.body.client || '').trim() || null,
    (req.body.address || '').trim() || null,
    Number.isFinite(budget) ? budget : null,
    status,
    (req.body.start_date || '').trim() || null,
    (req.body.end_date || '').trim() || null,
    (req.body.description || '').trim() || null,
    req.user.id
  );
  res.redirect('/projects');
});

// GET /projects/:id – detail stavby (info, ľudia, smenovky)
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
  const cur = dates.currentIsoWeek();

  res.render('project-detail', {
    title: project.name,
    active: 'projects',
    project, members, available, sheets,
    canManageMembers: perm.canAccessProject(req.user, project.id),
    canAssignForeman: perm.isFullAccess(req.user),
    cur,
    error: null,
  });
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

// POST /projects/:id/status (len plný prístup)
router.post('/:id/status', requireFullAccess, (req, res) => {
  const status = STATUSES.includes(req.body.status) ? req.body.status : 'planned';
  db.prepare('UPDATE projects SET status = ? WHERE id = ?').run(status, req.params.id);
  res.redirect(req.body.back === 'detail' ? '/projects/' + req.params.id : '/projects');
});

// POST /projects/:id/delete (len plný prístup)
router.post('/:id/delete', requireFullAccess, (req, res) => {
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  res.redirect('/projects');
});

module.exports = router;

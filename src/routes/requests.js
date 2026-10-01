const express = require('express');
const db = require('../db');
const perm = require('../permissions');
const { requireAuth, requireStaff } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireStaff);

// Zoznam žiadostí, ktoré daný používateľ môže riešiť.
function visibleRequests(user) {
  const base = `
    SELECT cr.*, e.first_name, e.last_name, p.name AS project_name
    FROM change_requests cr
    JOIN employees e ON e.id = cr.employee_id
    LEFT JOIN projects p ON p.id = cr.project_id`;
  if (perm.isFullAccess(user)) {
    return db.prepare(base + ' ORDER BY (cr.status="open") DESC, cr.created_at DESC').all();
  }
  const projIds = perm.foremanProjectIds(user);
  if (!projIds.length) return [];
  const ph = projIds.map(() => '?').join(',');
  // žiadosti zamestnancov, ktorí sú na stavbách daného parťáka
  return db
    .prepare(
      base +
        ` WHERE cr.employee_id IN (SELECT employee_id FROM site_members WHERE project_id IN (${ph}))
          ORDER BY (cr.status="open") DESC, cr.created_at DESC`
    )
    .all(...projIds);
}

function canHandle(user, request) {
  if (perm.isFullAccess(user)) return true;
  const projIds = perm.foremanProjectIds(user);
  if (!projIds.length) return false;
  const ph = projIds.map(() => '?').join(',');
  const row = db
    .prepare(`SELECT 1 FROM site_members WHERE employee_id = ? AND project_id IN (${ph})`)
    .get(request.employee_id, ...projIds);
  return !!row;
}

// GET /ziadosti
router.get('/', (req, res) => {
  const requests = visibleRequests(req.user);
  res.render('requests', {
    title: 'Žiadosti o zmenu',
    active: 'requests',
    requests,
    openCount: requests.filter((r) => r.status === 'open').length,
  });
});

// POST /ziadosti/:id/resolve
router.post('/:id/resolve', (req, res) => {
  const request = db.prepare('SELECT * FROM change_requests WHERE id = ?').get(req.params.id);
  if (!request || !canHandle(req.user, request)) {
    return res.status(403).render('error', { title: 'Prístup zamietnutý', message: 'Nemôžeš riešiť túto žiadosť.' });
  }
  const status = req.body.status === 'approved' ? 'approved' : req.body.status === 'rejected' ? 'rejected' : null;
  if (!status) return res.redirect('/ziadosti');
  db.prepare(
    `UPDATE change_requests SET status = ?, response = ?, handled_by = ?, resolved_at = datetime('now') WHERE id = ?`
  ).run(status, (req.body.response || '').trim() || null, req.user.id, request.id);
  res.redirect('/ziadosti');
});

module.exports = router;

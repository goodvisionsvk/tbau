const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const STATUSES = ['planned', 'active', 'paused', 'done'];

// GET /projects
router.get('/', (req, res) => {
  const projects = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
  res.render('projects', { title: 'Projekty', active: 'projects', projects, error: null });
});

// POST /projects – vytvorenie stavebného projektu
router.post('/', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) {
    const projects = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
    return res
      .status(400)
      .render('projects', { title: 'Projekty', active: 'projects', projects, error: 'Názov projektu je povinný.' });
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

// POST /projects/:id/status
router.post('/:id/status', (req, res) => {
  const status = STATUSES.includes(req.body.status) ? req.body.status : 'planned';
  db.prepare('UPDATE projects SET status = ? WHERE id = ?').run(status, req.params.id);
  res.redirect('/projects');
});

// POST /projects/:id/delete
router.post('/:id/delete', (req, res) => {
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  res.redirect('/projects');
});

module.exports = router;

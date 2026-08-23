const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const STATUSES = ['todo', 'in_progress', 'done'];
const PRIORITIES = ['low', 'medium', 'high'];

// GET /tasks – úlohy pri budovaní portálu
router.get('/', (req, res) => {
  const tasks = db
    .prepare("SELECT * FROM tasks ORDER BY CASE status WHEN 'in_progress' THEN 0 WHEN 'todo' THEN 1 ELSE 2 END, created_at DESC")
    .all();
  res.render('tasks', { title: 'Úlohy', active: 'tasks', tasks, error: null });
});

// POST /tasks
router.post('/', (req, res) => {
  const title = (req.body.title || '').trim();
  if (!title) {
    const tasks = db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all();
    return res
      .status(400)
      .render('tasks', { title: 'Úlohy', active: 'tasks', tasks, error: 'Názov úlohy je povinný.' });
  }
  const priority = PRIORITIES.includes(req.body.priority) ? req.body.priority : 'medium';
  db.prepare('INSERT INTO tasks (title, description, priority, created_by) VALUES (?,?,?,?)').run(
    title,
    (req.body.description || '').trim() || null,
    priority,
    req.user.id
  );
  res.redirect('/tasks');
});

// POST /tasks/:id/status
router.post('/:id/status', (req, res) => {
  const status = STATUSES.includes(req.body.status) ? req.body.status : 'todo';
  const doneAt = status === 'done' ? "datetime('now')" : 'NULL';
  db.prepare(`UPDATE tasks SET status = ?, done_at = ${doneAt} WHERE id = ?`).run(status, req.params.id);
  res.redirect('/tasks');
});

// POST /tasks/:id/delete
router.post('/:id/delete', (req, res) => {
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.redirect('/tasks');
});

module.exports = router;

const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /health – jednoduchý health check (pre testy a monitoring)
router.get('/health', (req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok', time: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ status: 'error', error: 'db' });
  }
});

// GET / – verejná úvodná stránka
router.get('/', (req, res) => {
  res.render('landing', { layout: 'layouts/public', title: 'Firemný portál' });
});

// GET /dashboard – prehľad po prihlásení
router.get('/dashboard', requireAuth, (req, res) => {
  const stats = {
    users: db.prepare('SELECT COUNT(*) c FROM users WHERE active = 1').get().c,
    apps: db.prepare('SELECT COUNT(*) c FROM apps').get().c,
    projects: db.prepare("SELECT COUNT(*) c FROM projects WHERE status != 'done'").get().c,
    tasks: db.prepare("SELECT COUNT(*) c FROM tasks WHERE status != 'done'").get().c,
  };
  const recentTasks = db
    .prepare("SELECT * FROM tasks WHERE status != 'done' ORDER BY created_at DESC LIMIT 5")
    .all();
  const recentProjects = db
    .prepare('SELECT * FROM projects ORDER BY created_at DESC LIMIT 5')
    .all();

  res.render('dashboard', {
    title: 'Prehľad',
    active: 'dashboard',
    stats,
    recentTasks,
    recentProjects,
  });
});

module.exports = router;

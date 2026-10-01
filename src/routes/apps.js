const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireAdmin);

// GET /apps – zoznam aplikácií (modulov), ktoré automatizujú procesy TBAU
router.get('/', (req, res) => {
  const apps = db.prepare('SELECT * FROM apps ORDER BY sort_order, name').all();
  res.render('apps', { title: 'Aplikácie', active: 'settings', apps });
});

module.exports = router;

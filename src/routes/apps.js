const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /apps – zoznam aplikácií (modulov), ktoré automatizujú procesy TBAU
router.get('/', (req, res) => {
  const apps = db.prepare('SELECT * FROM apps ORDER BY sort_order, name').all();
  res.render('apps', { title: 'Aplikácie', active: 'apps', apps });
});

module.exports = router;

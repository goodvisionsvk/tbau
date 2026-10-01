const express = require('express');
const db = require('../db');
const constants = require('../constants');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireAdmin);

// GET /apps – zoznam aplikácií (modulov), ktoré automatizujú procesy TBAU
router.get('/', (req, res) => {
  const apps = db
    .prepare('SELECT * FROM apps ORDER BY sort_order, name')
    .all()
    .map((a) => ({ ...a, href: constants.appHref(a) }));
  res.render('apps', { title: 'Aplikácie', active: 'settings', apps });
});

module.exports = router;

const express = require('express');
const db = require('../db');
const constants = require('../constants');
const { requireAuth, requireFullAccess } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireFullAccess);

function totals() {
  const r = db.prepare('SELECT COALESCE(SUM(hours),0) h, COALESCE(SUM(tokens),0) t FROM work_log').get();
  return { hours: r.h, tokens: r.t, value: Math.round(r.h * constants.workHourlyRate) };
}

// GET /praca – evidencia práce (rozpis prác + čas/náklady)
router.get('/', (req, res) => {
  const activities = db
    .prepare('SELECT * FROM work_log WHERE session_ref IS NULL AND hours = 0 ORDER BY entry_date, id')
    .all();
  const billed = db
    .prepare('SELECT * FROM work_log WHERE NOT (session_ref IS NULL AND hours = 0) ORDER BY entry_date DESC, id DESC')
    .all();
  res.render('work-log', {
    title: 'Vykázaná práca',
    active: 'settings',
    activities,
    billed,
    totals: totals(),
    rate: constants.workHourlyRate,
    currency: constants.currency,
  });
});

// POST /praca – pridať záznam
router.post('/', (req, res) => {
  const title = (req.body.title || '').trim();
  if (title) {
    let hours = parseFloat(String(req.body.hours || '0').replace(',', '.'));
    if (!Number.isFinite(hours) || hours < 0) hours = 0;
    const tokens = parseInt(String(req.body.tokens || '0').replace(/\D/g, ''), 10) || 0;
    const date = (req.body.entry_date || '').trim() || new Date().toISOString().slice(0, 10);
    db.prepare('INSERT INTO work_log (entry_date, title, hours, tokens, note) VALUES (?,?,?,?,?)').run(
      date, title, hours, tokens, (req.body.note || '').trim() || null
    );
  }
  res.redirect('/praca');
});

// POST /praca/:id/delete
router.post('/:id/delete', (req, res) => {
  db.prepare('DELETE FROM work_log WHERE id = ?').run(req.params.id);
  res.redirect('/praca');
});

module.exports = router;

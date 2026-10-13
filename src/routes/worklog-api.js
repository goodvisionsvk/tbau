// Chránený API endpoint pre automatické zapisovanie tokenov z Claude Code (SessionEnd hook).
// Mountuje sa PRED session/csrf middleware; autorizuje sa cez hlavičku X-Worklog-Secret.
const db = require('../db');
const config = require('../config');

module.exports = function worklogApi(req, res) {
  if (!config.worklogSecret || req.get('X-Worklog-Secret') !== config.worklogSecret) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const sessionRef = String(req.body.session || '').trim();
  const tokens = parseInt(String(req.body.tokens || '0').replace(/\D/g, ''), 10) || 0;
  let hours = parseFloat(String(req.body.hours || '0').replace(',', '.'));
  if (!Number.isFinite(hours) || hours < 0) hours = 0;
  const date = String(req.body.date || '').trim() || new Date().toISOString().slice(0, 10);
  if (!sessionRef) return res.status(400).json({ error: 'missing session' });

  db.prepare(
    `INSERT INTO work_log (entry_date, title, hours, tokens, session_ref)
     VALUES (?, 'Vývojová práca portálu', ?, ?, ?)
     ON CONFLICT(session_ref) DO UPDATE SET hours = excluded.hours, tokens = excluded.tokens, entry_date = excluded.entry_date`
  ).run(date, hours, tokens, sessionRef);

  res.json({ ok: true, hours, tokens });
};

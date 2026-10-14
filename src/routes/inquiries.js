const express = require('express');
const db = require('../db');
const mailer = require('../mailer');
const { requireAuth, requireFullAccess } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireFullAccess);

const S = (v) => ((v || '').trim() || null);
const STATUSES = { new: 'Nový', sent: 'Odoslaný', responded: 'Odpovedané', closed: 'Uzavretý' };
const STATUS_CLASS = { new: 'in_progress', sent: 'medium', responded: 'active', closed: 'planned' };

// aktívni zamestnanci s ich stavbami a „voľný od" (z KW_do stavieb)
function availableEmployees() {
  return db
    .prepare(
      `SELECT e.id, e.first_name, e.last_name, e.position, e.trade,
         (SELECT GROUP_CONCAT(p.name, ', ') FROM site_members sm JOIN projects p ON p.id=sm.project_id WHERE sm.employee_id=e.id) AS sites,
         (SELECT MAX(p.kw_do) FROM site_members sm JOIN projects p ON p.id=sm.project_id WHERE sm.employee_id=e.id) AS free_kw
       FROM employees e WHERE e.active = 1 ORDER BY e.last_name, e.first_name`
    )
    .all();
}

function inquiryEmployees(inquiryId) {
  return db
    .prepare(
      `SELECT e.* FROM inquiry_employees ie JOIN employees e ON e.id = ie.employee_id
       WHERE ie.inquiry_id = ? ORDER BY e.last_name, e.first_name`
    )
    .all(inquiryId);
}

function emailDraft(inq, customer, emps) {
  const L = [];
  L.push('Dobrý deň' + (customer && customer.name ? ', ' + customer.name : '') + ',');
  L.push('');
  L.push('máme voľných pracovníkov' + (inq.free_from ? ' od ' + inq.free_from : '') + ' a radi by sme Vám ponúkli našu pracovnú silu.');
  if (inq.profession) L.push('Profesia: ' + inq.profession);
  L.push('');
  if (emps.length) {
    L.push('Pracovníci:');
    emps.forEach((e) => L.push('• ' + e.last_name + ' ' + e.first_name + (e.trade ? ' – ' + e.trade : '')));
    L.push('');
  }
  if (inq.price) L.push('Cena: ' + inq.price);
  if (inq.references_text) { L.push(''); L.push('Referencie stavieb:'); L.push(inq.references_text); }
  if (inq.message) { L.push(''); L.push(inq.message); }
  L.push('');
  L.push('S pozdravom,');
  L.push('TBAU, s. r. o.');
  return L.join('\n');
}

// GET /dopyty
router.get('/', (req, res) => {
  const inquiries = db
    .prepare(
      `SELECT i.*, c.name AS customer_name,
         (SELECT COUNT(*) FROM inquiry_employees ie WHERE ie.inquiry_id = i.id) AS people
       FROM inquiries i LEFT JOIN customers c ON c.id = i.customer_id
       ORDER BY i.created_at DESC`
    )
    .all();
  res.render('inquiries', { title: 'Dopyty', active: 'inquiries', inquiries, statuses: STATUSES, statusClass: STATUS_CLASS });
});

// GET /dopyty/novy
router.get('/novy', (req, res) => {
  res.render('inquiry-new', {
    title: 'Nový dopyt', active: 'inquiries', error: null,
    customers: db.prepare("SELECT id, name FROM customers WHERE active = 1 ORDER BY name").all(),
    employees: availableEmployees(),
  });
});

// POST /dopyty – vytvorenie
router.post('/', (req, res) => {
  const info = db.prepare(
    `INSERT INTO inquiries (customer_id, title, profession, free_from, price, references_text, message, created_by)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run(
    req.body.customer_id ? Number(req.body.customer_id) : null,
    S(req.body.title), S(req.body.profession), S(req.body.free_from), S(req.body.price),
    S(req.body.references_text), S(req.body.message), req.user.id
  );
  const ids = [].concat(req.body.employee_id || []).map(Number).filter(Boolean);
  const ins = db.prepare('INSERT OR IGNORE INTO inquiry_employees (inquiry_id, employee_id) VALUES (?,?)');
  ids.forEach((id) => ins.run(info.lastInsertRowid, id));
  res.redirect('/dopyty/' + info.lastInsertRowid);
});

// Poskladá všetky údaje dopytu + e-mailový náhľad (pre detail aj odoslanie).
function buildInquiryView(id) {
  const inquiry = db.prepare('SELECT * FROM inquiries WHERE id = ?').get(id);
  if (!inquiry) return null;
  const customer = inquiry.customer_id ? db.prepare('SELECT * FROM customers WHERE id = ?').get(inquiry.customer_id) : null;
  const emps = inquiryEmployees(inquiry.id);
  const primary = customer
    ? db.prepare('SELECT email FROM contacts WHERE customer_id = ? AND email IS NOT NULL ORDER BY is_primary DESC LIMIT 1').get(customer.id)
    : null;
  const subject = inquiry.title || 'Ponuka voľných pracovníkov – TBAU';
  const body = emailDraft(inquiry, customer, emps);
  const toEmail = primary && primary.email ? primary.email : null;
  const mailto = 'mailto:' + (toEmail ? encodeURIComponent(toEmail) : '') +
    '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  return { inquiry, customer, emps, toEmail, subject, body, mailto };
}

// GET /dopyty/:id – detail + email náhľad
router.get('/:id', (req, res) => {
  const v = buildInquiryView(req.params.id);
  if (!v) return res.redirect('/dopyty');
  res.render('inquiry-detail', {
    title: v.subject, active: 'inquiries', inquiry: v.inquiry, customer: v.customer, emps: v.emps,
    toEmail: v.toEmail, subject: v.subject, body: v.body, mailto: v.mailto,
    statuses: STATUSES, statusClass: STATUS_CLASS,
    smtpReady: mailer.isConfigured(),
    sent: req.query.sent === '1',
    sendError: req.query.err ? decodeURIComponent(req.query.err) : null,
  });
});

// POST /dopyty/:id/send – odoslať dopyt priamo zo servera cez SMTP
router.post('/:id/send', async (req, res) => {
  const v = buildInquiryView(req.params.id);
  if (!v) return res.redirect('/dopyty');
  const back = '/dopyty/' + req.params.id;
  if (!mailer.isConfigured()) return res.redirect(back + '?err=' + encodeURIComponent('SMTP nie je nakonfigurované. Doplňte údaje v .env na serveri.'));
  if (!v.toEmail) return res.redirect(back + '?err=' + encodeURIComponent('Zákazník nemá e-mailový kontakt.'));
  try {
    await mailer.sendMail({ to: v.toEmail, subject: v.subject, text: v.body });
    db.prepare("UPDATE inquiries SET status = 'sent' WHERE id = ?").run(req.params.id);
    res.redirect(back + '?sent=1');
  } catch (e) {
    res.redirect(back + '?err=' + encodeURIComponent('Odoslanie zlyhalo: ' + e.message));
  }
});

// POST /dopyty/:id/status
router.post('/:id/status', (req, res) => {
  const status = Object.keys(STATUSES).includes(req.body.status) ? req.body.status : 'new';
  db.prepare('UPDATE inquiries SET status = ? WHERE id = ?').run(status, req.params.id);
  res.redirect('/dopyty/' + req.params.id);
});

// POST /dopyty/:id/delete
router.post('/:id/delete', (req, res) => {
  db.prepare('DELETE FROM inquiries WHERE id = ?').run(req.params.id);
  res.redirect('/dopyty');
});

module.exports = router;

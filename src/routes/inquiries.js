const express = require('express');
const path = require('path');
const db = require('../db');
const mailer = require('../mailer');
const constants = require('../constants');
const de = require('../util/trades-de');
const { refDir } = require('../upload');
const { requireAuth, requireFullAccess } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireFullAccess);

const S = (v) => ((v || '').trim() || null);
const DEFAULT_SUBJECT = 'Verfügbare Mitarbeiter / freie Kapazitäten';
const STATUSES = { new: 'Nový', sent: 'Odoslaný', responded: 'Odpovedané', closed: 'Uzavretý' };
const STATUS_CLASS = { new: 'in_progress', sent: 'medium', responded: 'active', closed: 'planned' };

// aktívni zamestnanci s ich stavbami a „voľný od" (z KW_do stavieb)
function availableEmployees() {
  return db
    .prepare(
      `SELECT e.id, e.first_name, e.last_name, e.position, e.trade, e.german_level,
         (SELECT GROUP_CONCAT(p.name, ', ') FROM site_members sm JOIN projects p ON p.id=sm.project_id WHERE sm.employee_id=e.id) AS sites,
         (SELECT MAX(p.kw_do) FROM site_members sm JOIN projects p ON p.id=sm.project_id WHERE sm.employee_id=e.id) AS free_kw
       FROM employees e WHERE e.active = 1 ORDER BY e.last_name, e.first_name`
    )
    .all()
    .map((e) => Object.assign(e, { prof_de: de.tradeDe(e.trade) }));
}

function inquiryEmployees(inquiryId) {
  return db
    .prepare(
      `SELECT e.* FROM inquiry_employees ie JOIN employees e ON e.id = ie.employee_id
       WHERE ie.inquiry_id = ? ORDER BY e.last_name, e.first_name`
    )
    .all(inquiryId);
}

// aktívne referenčné stavby (pre výber v dopyte)
function allReferences() {
  return db.prepare(
    `SELECT r.*, (SELECT COUNT(*) FROM reference_images i WHERE i.reference_id = r.id) AS img_count
     FROM reference_sites r WHERE r.active = 1 ORDER BY r.title`
  ).all();
}

// referencie priložené k dopytu + ich fotky
function inquiryReferences(inquiryId) {
  const refs = db.prepare(
    `SELECT r.* FROM inquiry_references ir JOIN reference_sites r ON r.id = ir.reference_id
     WHERE ir.inquiry_id = ? ORDER BY r.title`
  ).all(inquiryId);
  refs.forEach((r) => { r.images = db.prepare('SELECT * FROM reference_images WHERE reference_id = ? ORDER BY id').all(r.id); });
  return refs;
}

// Nemecký e-mail s ponukou voľných pracovníkov (podľa reálnej šablóny obchodníka).
function emailDraft(inq, customer, emps, senderName, refs) {
  const co = constants.company;
  const L = [];
  L.push('Sehr geehrte Damen und Herren,');
  L.push('');
  L.push('ich möchte Sie kurz darüber informieren, dass wir derzeit bzw. in Kürze folgende Mitarbeiter zur Verfügung stellen können:');
  L.push('');
  emps.forEach((e) => L.push('• ' + de.workerLine(e)));
  if (emps.length) L.push('');
  L.push('Die Mitarbeiter können je nach Bedarf auch in kleinere Gruppen aufgeteilt werden.');
  if (inq.free_from) L.push('Die Mannschaft wird voraussichtlich ab ' + inq.free_from + ' wieder frei sein.');
  L.push('');
  const bereiche = de.bereicheFrom(emps);
  const bList = bereiche.length ? bereiche.join(', ') : 'Schalungsbau, Betonbau, Eisenflechten, Maurerarbeiten, Kranführung';
  L.push('Falls Sie aktuell oder in nächster Zeit Bedarf an Personal in den Bereichen ' + bList +
    ' haben, geben Sie mir bitte kurz Bescheid. Gerne können wir die genaue Besetzung und den möglichen Einsatztermin abstimmen.');
  if (inq.price) { L.push(''); L.push('Unser Stundensatz: ' + inq.price + '.'); }
  if ((refs && refs.length) || inq.references_text) {
    L.push('');
    L.push('Referenzprojekte:');
    (refs || []).forEach((r) => {
      const meta = [r.location, r.period].filter(Boolean).join(', ');
      let line = '• ' + r.title + (meta ? ' (' + meta + ')' : '');
      if (r.work_type) line += ' – ' + r.work_type;
      L.push(line);
      if (r.description) L.push('  ' + r.description);
    });
    if (inq.references_text) L.push('• ' + inq.references_text);
    const totalImgs = (refs || []).reduce((n, r) => n + (r.images ? r.images.length : 0), 0);
    if (totalImgs) L.push('(Im Anhang senden wir Ihnen ' + totalImgs + ' Fotos von unseren Referenzprojekten.)');
  }
  if (inq.message) { L.push(''); L.push(inq.message); }
  L.push('');
  L.push('Falls Sie Interesse haben, stellen wir Ihnen gerne den Kontakt zum Bauleiter der betreffenden Baustelle zur Verfügung. Alle erforderlichen Unternehmensunterlagen senden wir Ihnen auf Anfrage gerne zu.');
  L.push('');
  L.push('Für Rückfragen stehe ich Ihnen jederzeit gerne zur Verfügung.');
  L.push('');
  L.push('Mit freundlichen Grüßen');
  if (senderName) L.push(senderName);
  L.push(co.name);
  L.push(co.address + ' · Tel.: ' + co.phone + ' · ' + co.email + ' · www.tbau.eu');
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
    references: allReferences(),
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
  const refIds = [].concat(req.body.reference_id || []).map(Number).filter(Boolean);
  const insR = db.prepare('INSERT OR IGNORE INTO inquiry_references (inquiry_id, reference_id) VALUES (?,?)');
  refIds.forEach((id) => insR.run(info.lastInsertRowid, id));
  res.redirect('/dopyty/' + info.lastInsertRowid);
});

// Poskladá všetky údaje dopytu + nemecký e-mailový náhľad (pre detail aj odoslanie).
function buildInquiryView(id, senderName) {
  const inquiry = db.prepare('SELECT * FROM inquiries WHERE id = ?').get(id);
  if (!inquiry) return null;
  const customer = inquiry.customer_id ? db.prepare('SELECT * FROM customers WHERE id = ?').get(inquiry.customer_id) : null;
  const emps = inquiryEmployees(inquiry.id);
  const primary = customer
    ? db.prepare('SELECT email FROM contacts WHERE customer_id = ? AND email IS NOT NULL ORDER BY is_primary DESC LIMIT 1').get(customer.id)
    : null;
  const refs = inquiryReferences(inquiry.id);
  const subject = inquiry.title || DEFAULT_SUBJECT;
  const body = emailDraft(inquiry, customer, emps, senderName, refs);
  const toEmail = primary && primary.email ? primary.email : null;
  const mailto = 'mailto:' + (toEmail ? encodeURIComponent(toEmail) : '') +
    '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  // prílohy e-mailu = fotky z vybraných referencií
  const attachments = [];
  refs.forEach((r) => (r.images || []).forEach((im) => {
    attachments.push({ filename: im.original_name || path.basename(im.file_path), path: path.join(refDir, path.basename(im.file_path)) });
  }));
  return { inquiry, customer, emps, refs, toEmail, subject, body, mailto, attachments };
}

// GET /dopyty/:id – detail + email náhľad
router.get('/:id', (req, res) => {
  const v = buildInquiryView(req.params.id, req.user.full_name);
  if (!v) return res.redirect('/dopyty');
  const selectedRefIds = v.refs.map((r) => r.id);
  res.render('inquiry-detail', {
    title: v.subject, active: 'inquiries', inquiry: v.inquiry, customer: v.customer, emps: v.emps,
    toEmail: v.toEmail, subject: v.subject, body: v.body, mailto: v.mailto,
    refs: v.refs, attachCount: v.attachments.length,
    allRefs: allReferences(), selectedRefIds,
    statuses: STATUSES, statusClass: STATUS_CLASS,
    smtpReady: mailer.isConfigured(),
    sent: req.query.sent === '1',
    sendError: req.query.err ? decodeURIComponent(req.query.err) : null,
  });
});

// POST /dopyty/:id/references – úprava výberu priložených referencií
router.post('/:id/references', (req, res) => {
  const inq = db.prepare('SELECT id FROM inquiries WHERE id = ?').get(req.params.id);
  if (!inq) return res.redirect('/dopyty');
  db.prepare('DELETE FROM inquiry_references WHERE inquiry_id = ?').run(req.params.id);
  const refIds = [].concat(req.body.reference_id || []).map(Number).filter(Boolean);
  const insR = db.prepare('INSERT OR IGNORE INTO inquiry_references (inquiry_id, reference_id) VALUES (?,?)');
  refIds.forEach((id) => insR.run(req.params.id, id));
  res.redirect('/dopyty/' + req.params.id);
});

// POST /dopyty/:id/send – odoslať dopyt priamo zo servera cez SMTP (text sa dá pred odoslaním upraviť)
router.post('/:id/send', async (req, res) => {
  const v = buildInquiryView(req.params.id, req.user.full_name);
  if (!v) return res.redirect('/dopyty');
  const back = '/dopyty/' + req.params.id;
  if (!mailer.isConfigured()) return res.redirect(back + '?err=' + encodeURIComponent('SMTP nie je nakonfigurované. Nastav ho v Nastavenia → E-mail (SMTP).'));
  if (!v.toEmail) return res.redirect(back + '?err=' + encodeURIComponent('Zákazník nemá e-mailový kontakt.'));
  const subject = S(req.body.subject) || v.subject;
  const body = (req.body.body != null && req.body.body.trim()) ? req.body.body : v.body;
  try {
    await mailer.sendMail({ to: v.toEmail, subject, text: body, attachments: v.attachments });
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

const express = require('express');
const db = require('../db');
const constants = require('../constants');
const { requireAuth, requireFullAccess } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireFullAccess);

const S = (v) => ((v || '').trim() || null);
const CS = constants.customerStatuses;

function customerFields(body) {
  const price = body.hourly_price ? parseFloat(String(body.hourly_price).replace(',', '.')) : null;
  let rating = parseInt(body.rating, 10);
  if (!(rating >= 1 && rating <= 5)) rating = null;
  return {
    name: (body.name || '').trim(),
    country: S(body.country),
    city: S(body.city),
    address: S(body.address),
    status: Object.keys(CS).includes(body.status) ? body.status : 'potencialny',
    owner: S(body.owner),
    source: S(body.source),
    billing_info: S(body.billing_info),
    work_type: Object.keys(constants.workTypes).includes(body.work_type) ? body.work_type : null,
    hourly_price: Number.isFinite(price) ? price : null,
    min_group: Object.keys(constants.minGroups).includes(body.min_group) ? body.min_group : null,
    payment_terms: S(body.payment_terms),
    payment_discipline: S(body.payment_discipline),
    rating,
    end_reason: S(body.end_reason),
    note: S(body.note),
  };
}

function listCustomers(f) {
  const where = [];
  const params = [];
  where.push(f.archived ? 'active = 0' : 'active = 1');
  if (f.status && Object.keys(CS).includes(f.status)) { where.push('status = ?'); params.push(f.status); }
  if (f.q) {
    where.push('(name LIKE ? OR city LIKE ? OR country LIKE ? OR owner LIKE ?)');
    const l = '%' + f.q + '%';
    params.push(l, l, l, l);
  }
  return db
    .prepare(`SELECT * FROM customers WHERE ${where.join(' AND ')} ORDER BY name`)
    .all(...params);
}

const enums = () => ({
  statuses: constants.customerStatuses,
  statusClass: constants.customerStatusClass,
  workTypes: constants.workTypes,
  minGroups: constants.minGroups,
  paymentDisciplines: constants.paymentDisciplines,
  sources: constants.contactSources,
  endReasons: constants.endReasons,
  contactRoles: constants.contactRoles,
});

// GET /zakaznici
router.get('/', (req, res) => {
  const f = {
    q: (req.query.q || '').trim(),
    status: Object.keys(CS).includes(req.query.status) ? req.query.status : '',
    archived: req.query.archived === '1',
  };
  res.render('customers', Object.assign({
    title: 'Zákazníci', active: 'customers', customers: listCustomers(f), filter: f,
  }, enums()));
});

// GET /zakaznici/novy
router.get('/novy', (req, res) => {
  res.render('customer-new', Object.assign({ title: 'Nový zákazník', active: 'customers', error: null }, enums()));
});

// POST /zakaznici – vytvorenie
router.post('/', (req, res) => {
  const c = customerFields(req.body);
  if (!c.name) {
    return res.status(400).render('customer-new', Object.assign({ title: 'Nový zákazník', active: 'customers', error: 'Názov firmy je povinný.' }, enums()));
  }
  // kontrola duplicity (bez ohľadu na veľkosť písmen)
  const dup = db.prepare('SELECT id FROM customers WHERE LOWER(name) = LOWER(?)').get(c.name);
  if (dup) {
    return res.status(400).render('customer-new', Object.assign({ title: 'Nový zákazník', active: 'customers', error: 'Firma s týmto názvom už existuje.' }, enums()));
  }
  const info = db.prepare(
    `INSERT INTO customers (name,country,city,address,status,owner,source,billing_info,work_type,hourly_price,min_group,payment_terms,payment_discipline,rating,end_reason,note,created_by)
     VALUES (@name,@country,@city,@address,@status,@owner,@source,@billing_info,@work_type,@hourly_price,@min_group,@payment_terms,@payment_discipline,@rating,@end_reason,@note,@created_by)`
  ).run(Object.assign(c, { created_by: req.user.id }));
  res.redirect('/zakaznici/' + info.lastInsertRowid);
});

function renderDetail(res, status, id, extra) {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  if (!customer) return res.redirect('/zakaznici');
  const contacts = db.prepare('SELECT * FROM contacts WHERE customer_id = ? ORDER BY is_primary DESC, name').all(id);
  const inquiries = db.prepare('SELECT * FROM inquiries WHERE customer_id = ? ORDER BY created_at DESC LIMIT 10').all(id);
  res.status(status).render('customer-detail', Object.assign({
    title: customer.name, active: 'customers', customer, contacts, inquiries, error: null,
  }, enums(), extra));
}

// GET /zakaznici/:id
router.get('/:id', (req, res) => renderDetail(res, 200, req.params.id, {}));

// POST /zakaznici/:id – úprava
router.post('/:id', (req, res) => {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!customer) return res.redirect('/zakaznici');
  const c = customerFields(req.body);
  if (!c.name) return renderDetail(res, 400, customer.id, { error: 'Názov firmy je povinný.' });
  db.prepare(
    `UPDATE customers SET name=@name,country=@country,city=@city,address=@address,status=@status,owner=@owner,
       source=@source,billing_info=@billing_info,work_type=@work_type,hourly_price=@hourly_price,min_group=@min_group,
       payment_terms=@payment_terms,payment_discipline=@payment_discipline,rating=@rating,end_reason=@end_reason,note=@note
     WHERE id=@id`
  ).run(Object.assign(c, { id: customer.id }));
  res.redirect('/zakaznici/' + customer.id);
});

// POST /zakaznici/:id/kontakt – pridať kontakt
router.post('/:id/kontakt', (req, res) => {
  const customer = db.prepare('SELECT id FROM customers WHERE id = ?').get(req.params.id);
  if (!customer) return res.redirect('/zakaznici');
  const name = (req.body.name || '').trim();
  if (name) {
    db.prepare('INSERT INTO contacts (customer_id,name,role,email,phone,is_primary) VALUES (?,?,?,?,?,?)')
      .run(customer.id, name, S(req.body.role), S(req.body.email), S(req.body.phone), req.body.is_primary ? 1 : 0);
  }
  res.redirect('/zakaznici/' + customer.id);
});

// POST /zakaznici/:id/kontakt/:cid/delete
router.post('/:id/kontakt/:cid/delete', (req, res) => {
  db.prepare('DELETE FROM contacts WHERE id = ? AND customer_id = ?').run(req.params.cid, req.params.id);
  res.redirect('/zakaznici/' + req.params.id);
});

// POST /zakaznici/:id/archive – archivovať / obnoviť
router.post('/:id/archive', (req, res) => {
  db.prepare('UPDATE customers SET active = 1 - active WHERE id = ?').run(req.params.id);
  res.redirect(req.body.back === 'detail' ? '/zakaznici/' + req.params.id : '/zakaznici');
});

// POST /zakaznici/:id/delete – úplné zmazanie
router.post('/:id/delete', (req, res) => {
  db.prepare('DELETE FROM customers WHERE id = ?').run(req.params.id);
  res.redirect('/zakaznici');
});

module.exports = router;

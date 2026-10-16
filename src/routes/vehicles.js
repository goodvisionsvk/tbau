const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const constants = require('../constants');
const { requireAuth, requireFullAccess } = require('../middleware/auth');
const { uploadVehicleDoc, vehDir } = require('../upload');

const router = express.Router();
router.use(requireAuth, requireFullAccess);

const S = (v) => ((v || '').trim() || null);
const N = (v) => (v === '' || v == null ? null : parseInt(v, 10));

function fields(body) {
  return {
    code: S(body.code),
    name: S(body.name),
    spz: S(body.spz),
    vin: S(body.vin),
    vehicle_type: constants.vehicleTypes.includes(body.vehicle_type) ? body.vehicle_type : null,
    seats: N(body.seats),
    year: N(body.year),
    holder_employee_id: N(body.holder_employee_id),
    project_id: N(body.project_id),
    note: S(body.note),
  };
}

function enums() {
  return {
    types: constants.vehicleTypes,
    docTypes: constants.vehicleDocTypes,
    employees: db.prepare("SELECT id, first_name, last_name FROM employees WHERE active = 1 ORDER BY last_name, first_name").all(),
    projects: db.prepare("SELECT id, name FROM projects ORDER BY name").all(),
  };
}

// GET /vozidla – zoznam + filter
router.get('/', (req, res) => {
  const f = { q: (req.query.q || '').trim(), type: req.query.type || '', archived: req.query.archived === '1' };
  let rows = db.prepare(
    `SELECT v.*, e.first_name AS h_first, e.last_name AS h_last, p.name AS project_name,
       (SELECT COUNT(*) FROM vehicle_documents d WHERE d.vehicle_id = v.id) AS doc_count
     FROM vehicles v
     LEFT JOIN employees e ON e.id = v.holder_employee_id
     LEFT JOIN projects p ON p.id = v.project_id
     WHERE v.active = ? ORDER BY v.code, v.name`
  ).all(f.archived ? 0 : 1);
  if (f.type) rows = rows.filter((v) => v.vehicle_type === f.type);
  if (f.q) rows = rows.filter((v) => `${v.code || ''} ${v.name || ''} ${v.spz || ''}`.toLowerCase().includes(f.q.toLowerCase()));
  res.render('vehicles', { title: 'Vozidlá', active: 'assets', vehicles: rows, filter: f, types: constants.vehicleTypes });
});

// GET /vozidla/novy
router.get('/novy', (req, res) => {
  res.render('vehicle-new', Object.assign({ title: 'Nové vozidlo', active: 'assets', error: null }, enums()));
});

// POST /vozidla – vytvorenie
router.post('/', (req, res) => {
  const v = fields(req.body);
  if (!v.code && !v.name && !v.spz) {
    return res.status(400).render('vehicle-new', Object.assign({ title: 'Nové vozidlo', active: 'assets', error: 'Zadaj aspoň označenie, názov alebo ŠPZ.' }, enums()));
  }
  const info = db.prepare(
    `INSERT INTO vehicles (code,name,spz,vin,vehicle_type,seats,year,holder_employee_id,project_id,note,created_by)
     VALUES (@code,@name,@spz,@vin,@vehicle_type,@seats,@year,@holder_employee_id,@project_id,@note,@created_by)`
  ).run(Object.assign(v, { created_by: req.user.id }));
  res.redirect('/vozidla/' + info.lastInsertRowid);
});

function renderDetail(res, id, extra = {}) {
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id);
  if (!vehicle) return res.redirect('/vozidla');
  const docs = db.prepare('SELECT * FROM vehicle_documents WHERE vehicle_id = ? ORDER BY COALESCE(valid_until, \'\') , id').all(id);
  res.render('vehicle-detail', Object.assign({
    title: (vehicle.code || vehicle.name || 'Vozidlo'), active: 'assets',
    vehicle, docs, error: null, saved: false,
  }, enums(), extra));
}

// GET /vozidla/:id – detail
router.get('/:id', (req, res) => renderDetail(res, req.params.id, { saved: req.query.saved === '1' }));

// POST /vozidla/:id – úprava
router.post('/:id', (req, res) => {
  const ex = db.prepare('SELECT id FROM vehicles WHERE id = ?').get(req.params.id);
  if (!ex) return res.redirect('/vozidla');
  const v = fields(req.body);
  db.prepare(
    `UPDATE vehicles SET code=@code,name=@name,spz=@spz,vin=@vin,vehicle_type=@vehicle_type,seats=@seats,year=@year,
       holder_employee_id=@holder_employee_id,project_id=@project_id,note=@note WHERE id=@id`
  ).run(Object.assign(v, { id: Number(req.params.id) }));
  res.redirect('/vozidla/' + req.params.id + '?saved=1');
});

// POST /vozidla/:id/doklad – nahratie dokladu
router.post('/:id/doklad', (req, res) => {
  const ex = db.prepare('SELECT id FROM vehicles WHERE id = ?').get(req.params.id);
  if (!ex) return res.redirect('/vozidla');
  uploadVehicleDoc(req, res, (err) => {
    if (err) return renderDetail(res, req.params.id, { error: err.message });
    if (!req.file) return renderDetail(res, req.params.id, { error: 'Vyber súbor dokladu.' });
    const dt = constants.vehicleDocTypes.includes(req.body.doc_type) ? req.body.doc_type : (S(req.body.doc_type) || 'Iné');
    db.prepare(
      'INSERT INTO vehicle_documents (vehicle_id, doc_type, file_path, original_name, mime, size, valid_until, note, uploaded_by) VALUES (?,?,?,?,?,?,?,?,?)'
    ).run(req.params.id, dt, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, S(req.body.valid_until), S(req.body.note), req.user.id);
    res.redirect('/vozidla/' + req.params.id);
  });
});

// GET /vozidla/:id/doklad/:docId/subor – zobrazenie súboru (chránené)
router.get('/:id/doklad/:docId/subor', (req, res) => {
  const d = db.prepare('SELECT * FROM vehicle_documents WHERE id = ? AND vehicle_id = ?').get(req.params.docId, req.params.id);
  if (!d) return res.status(404).end();
  const full = path.join(vehDir, path.basename(d.file_path));
  if (!fs.existsSync(full)) return res.status(404).end();
  res.sendFile(full);
});

// POST /vozidla/:id/doklad/:docId/delete
router.post('/:id/doklad/:docId/delete', (req, res) => {
  const d = db.prepare('SELECT * FROM vehicle_documents WHERE id = ? AND vehicle_id = ?').get(req.params.docId, req.params.id);
  if (d) {
    try { fs.unlinkSync(path.join(vehDir, path.basename(d.file_path))); } catch (e) { /* ignore */ }
    db.prepare('DELETE FROM vehicle_documents WHERE id = ?').run(d.id);
  }
  res.redirect('/vozidla/' + req.params.id);
});

// POST /vozidla/:id/archive – archivácia/obnova
router.post('/:id/archive', (req, res) => {
  db.prepare('UPDATE vehicles SET active = 1 - active WHERE id = ?').run(req.params.id);
  res.redirect(req.body.back === 'detail' ? '/vozidla/' + req.params.id : '/vozidla');
});

// POST /vozidla/:id/delete – úplné zmazanie (vrátane súborov)
router.post('/:id/delete', (req, res) => {
  db.prepare('SELECT file_path FROM vehicle_documents WHERE vehicle_id = ?').all(req.params.id).forEach((d) => {
    try { fs.unlinkSync(path.join(vehDir, path.basename(d.file_path))); } catch (e) { /* ignore */ }
  });
  db.prepare('DELETE FROM vehicles WHERE id = ?').run(req.params.id);
  res.redirect('/vozidla');
});

module.exports = router;

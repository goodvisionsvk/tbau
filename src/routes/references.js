const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { requireAuth, requireFullAccess } = require('../middleware/auth');
const { uploadRefImages, refDir } = require('../upload');

const router = express.Router();
router.use(requireAuth, requireFullAccess);

const S = (v) => ((v || '').trim() || null);

function fields(body) {
  return {
    title: (body.title || '').trim(),
    location: S(body.location),
    period: S(body.period),
    work_type: S(body.work_type),
    description: S(body.description),
    note: S(body.note),
  };
}

function images(refId) {
  return db.prepare('SELECT * FROM reference_images WHERE reference_id = ? ORDER BY id').all(refId);
}

// GET /referencie – zoznam
router.get('/', (req, res) => {
  const q = (req.query.q || '').trim();
  const archived = req.query.archived === '1';
  let rows = db.prepare(
    `SELECT r.*, (SELECT COUNT(*) FROM reference_images i WHERE i.reference_id = r.id) AS img_count
     FROM reference_sites r WHERE r.active = ? ORDER BY r.created_at DESC`
  ).all(archived ? 0 : 1);
  if (q) rows = rows.filter((r) => `${r.title} ${r.location || ''} ${r.work_type || ''}`.toLowerCase().includes(q.toLowerCase()));
  res.render('references', { title: 'Referenčné stavby', active: 'references', refs: rows, filter: { q, archived } });
});

// GET /referencie/novy
router.get('/novy', (req, res) => {
  res.render('reference-new', { title: 'Nová referenčná stavba', active: 'references', error: null });
});

// POST /referencie – vytvorenie
router.post('/', (req, res) => {
  const f = fields(req.body);
  if (!f.title) return res.status(400).render('reference-new', { title: 'Nová referenčná stavba', active: 'references', error: 'Názov je povinný.' });
  const info = db.prepare(
    `INSERT INTO reference_sites (title, location, period, work_type, description, note, created_by)
     VALUES (@title,@location,@period,@work_type,@description,@note,@created_by)`
  ).run(Object.assign(f, { created_by: req.user.id }));
  res.redirect('/referencie/' + info.lastInsertRowid);
});

function renderDetail(res, id, extra = {}) {
  const ref = db.prepare('SELECT * FROM reference_sites WHERE id = ?').get(id);
  if (!ref) return res.redirect('/referencie');
  res.render('reference-detail', Object.assign({
    title: ref.title, active: 'references', ref, imgs: images(id), error: null, saved: false,
  }, extra));
}

// GET /referencie/:id – detail
router.get('/:id', (req, res) => renderDetail(res, req.params.id, { saved: req.query.saved === '1' }));

// POST /referencie/:id – úprava
router.post('/:id', (req, res) => {
  const ref = db.prepare('SELECT id FROM reference_sites WHERE id = ?').get(req.params.id);
  if (!ref) return res.redirect('/referencie');
  const f = fields(req.body);
  if (!f.title) return renderDetail(res, req.params.id, { error: 'Názov je povinný.' });
  db.prepare(
    `UPDATE reference_sites SET title=@title, location=@location, period=@period, work_type=@work_type, description=@description, note=@note WHERE id=@id`
  ).run(Object.assign(f, { id: Number(req.params.id) }));
  res.redirect('/referencie/' + req.params.id + '?saved=1');
});

// POST /referencie/:id/fotky – nahratie fotiek
router.post('/:id/fotky', (req, res) => {
  const ref = db.prepare('SELECT id FROM reference_sites WHERE id = ?').get(req.params.id);
  if (!ref) return res.redirect('/referencie');
  uploadRefImages(req, res, (err) => {
    if (err) return renderDetail(res, req.params.id, { error: err.message });
    const ins = db.prepare('INSERT INTO reference_images (reference_id, file_path, original_name, mime, size) VALUES (?,?,?,?,?)');
    (req.files || []).forEach((file) => ins.run(req.params.id, file.filename, file.originalname, file.mimetype, file.size));
    res.redirect('/referencie/' + req.params.id);
  });
});

// GET /referencie/:id/foto/:imgId – zobrazenie fotky (chránené)
router.get('/:id/foto/:imgId', (req, res) => {
  const img = db.prepare('SELECT * FROM reference_images WHERE id = ? AND reference_id = ?').get(req.params.imgId, req.params.id);
  if (!img) return res.status(404).end();
  const full = path.join(refDir, path.basename(img.file_path));
  if (!fs.existsSync(full)) return res.status(404).end();
  res.sendFile(full);
});

// POST /referencie/:id/foto/:imgId/delete
router.post('/:id/foto/:imgId/delete', (req, res) => {
  const img = db.prepare('SELECT * FROM reference_images WHERE id = ? AND reference_id = ?').get(req.params.imgId, req.params.id);
  if (img) {
    try { fs.unlinkSync(path.join(refDir, path.basename(img.file_path))); } catch (e) { /* ignore */ }
    db.prepare('DELETE FROM reference_images WHERE id = ?').run(img.id);
  }
  res.redirect('/referencie/' + req.params.id);
});

// POST /referencie/:id/archive – archivácia/obnova
router.post('/:id/archive', (req, res) => {
  db.prepare('UPDATE reference_sites SET active = 1 - active WHERE id = ?').run(req.params.id);
  res.redirect(req.body.back === 'detail' ? '/referencie/' + req.params.id : '/referencie');
});

// POST /referencie/:id/delete – úplné zmazanie (vrátane súborov)
router.post('/:id/delete', (req, res) => {
  images(req.params.id).forEach((img) => {
    try { fs.unlinkSync(path.join(refDir, path.basename(img.file_path))); } catch (e) { /* ignore */ }
  });
  db.prepare('DELETE FROM reference_sites WHERE id = ?').run(req.params.id);
  res.redirect('/referencie');
});

module.exports = router;

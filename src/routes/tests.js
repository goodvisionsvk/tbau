const express = require('express');
const config = require('../config');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireAdmin);

// Test: overí, či stránka/aplikácia funguje (self HTTP check na /health).
async function siteWorksTest() {
  const url = `http://127.0.0.1:${config.port}/health`;
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    const data = await resp.json().catch(() => ({}));
    const ok = resp.status === 200 && data.status === 'ok';
    return {
      name: 'Stránka funguje',
      description: 'Overí, že server odpovedá a databáza je dostupná (GET /health).',
      ok,
      detail: ok ? `HTTP ${resp.status}, status "${data.status}"` : `HTTP ${resp.status}`,
      durationMs: Date.now() - started,
    };
  } catch (e) {
    return {
      name: 'Stránka funguje',
      description: 'Overí, že server odpovedá a databáza je dostupná (GET /health).',
      ok: false,
      detail: e.name === 'AbortError' ? 'Časový limit (5 s) vypršal' : 'Server neodpovedal',
      durationMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }

// CRUD test v transakcii, ktorá sa VŽDY vráti späť (nič neostane v DB).
function crudTest(name, description, steps) {
  const started = Date.now();
  let ok = true;
  let detail = '';
  db.exec('BEGIN');
  try {
    detail = steps();
  } catch (e) {
    ok = false;
    detail = e.message;
  } finally {
    try { db.exec('ROLLBACK'); } catch (e) { /* ignore */ }
  }
  return { name, description, ok, detail: ok ? (detail || 'OK') : detail, durationMs: Date.now() - started };
}

function employeeCrud() {
  return crudTest('CRUD zamestnanca', 'Vytvorenie, čítanie, úprava a zmazanie zamestnanca.', () => {
    const id = db.prepare("INSERT INTO employees (first_name,last_name,position) VALUES ('__TEST__','Zamestnanec','robotnik')").run().lastInsertRowid;
    let row = db.prepare('SELECT * FROM employees WHERE id=?').get(id);
    assert(row && row.first_name === '__TEST__', 'čítanie po vytvorení zlyhalo');
    db.prepare("UPDATE employees SET last_name='Upraveny', trade='Murár' WHERE id=?").run(id);
    row = db.prepare('SELECT last_name,trade FROM employees WHERE id=?').get(id);
    assert(row.last_name === 'Upraveny' && row.trade === 'Murár', 'úprava zlyhala');
    db.prepare('DELETE FROM employees WHERE id=?').run(id);
    assert(!db.prepare('SELECT 1 FROM employees WHERE id=?').get(id), 'zmazanie zlyhalo');
    return 'vytvorenie, čítanie, úprava, zmazanie OK';
  });
}

function projectCrud() {
  return crudTest('CRUD stavby', 'Vytvorenie, čítanie, úprava a zmazanie stavby.', () => {
    const id = db.prepare("INSERT INTO projects (name,status,bauleiter) VALUES ('__TEST stavba__','active','X')").run().lastInsertRowid;
    let row = db.prepare('SELECT * FROM projects WHERE id=?').get(id);
    assert(row && row.name === '__TEST stavba__', 'čítanie po vytvorení zlyhalo');
    db.prepare("UPDATE projects SET bauleiter='Y', kw_od=10, status='done' WHERE id=?").run(id);
    row = db.prepare('SELECT bauleiter,kw_od,status FROM projects WHERE id=?').get(id);
    assert(row.bauleiter === 'Y' && row.kw_od === 10 && row.status === 'done', 'úprava zlyhala');
    db.prepare('DELETE FROM projects WHERE id=?').run(id);
    assert(!db.prepare('SELECT 1 FROM projects WHERE id=?').get(id), 'zmazanie zlyhalo');
    return 'vytvorenie, čítanie, úprava, zmazanie OK';
  });
}

// GET /tests
router.get('/', async (req, res) => {
  const results = [await siteWorksTest(), employeeCrud(), projectCrud()];
  res.render('tests', {
    title: 'Testy',
    active: 'settings',
    results,
    ranAt: new Date().toLocaleString('sk-SK'),
  });
});

module.exports = router;

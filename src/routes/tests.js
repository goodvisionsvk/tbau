const express = require('express');
const config = require('../config');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

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

// GET /tests
router.get('/', async (req, res) => {
  const results = [await siteWorksTest()];
  res.render('tests', {
    title: 'Testy',
    active: 'tests',
    results,
    ranAt: new Date().toLocaleString('sk-SK'),
  });
});

module.exports = router;

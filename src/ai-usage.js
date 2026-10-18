// Limity a evidencia spotreby AI (čítanie smenoviek).
// Ochrana proti neúmyselnému "pretečeniu" nákladov: denný limit počtu čítaní + mesačný limit nákladov.
const db = require('./db');
const store = require('./settings-store');

const USD_EUR = 0.92; // približný kurz na výpočet limitu v €

function today() { return new Date().toISOString().slice(0, 10); }
function monthPrefix() { return new Date().toISOString().slice(0, 7); }

function maxReadsDay() { const n = parseInt(store.get('ai_max_reads_day', '30'), 10); return Number.isFinite(n) ? n : 30; }
function maxCostMonthEur() { const n = parseFloat(store.get('ai_max_cost_month_eur', '3')); return Number.isFinite(n) ? n : 3; }

function todayReads() {
  const r = db.prepare('SELECT reads FROM ai_usage WHERE day = ?').get(today());
  return r ? r.reads : 0;
}
function monthCostEur() {
  const r = db.prepare("SELECT COALESCE(SUM(cost_usd),0) c FROM ai_usage WHERE day LIKE ?").get(monthPrefix() + '%');
  return (r ? r.c : 0) * USD_EUR;
}

// Skontroluje limity PRED čítaním. Vráti {ok} alebo {ok:false, reason}.
function checkLimits() {
  const mr = maxReadsDay();
  if (mr > 0 && todayReads() >= mr) {
    return { ok: false, reason: `Denný limit čítaní (${mr}) je vyčerpaný. Skús zajtra, alebo zvýš limit v Nastavenia → AI.` };
  }
  const mc = maxCostMonthEur();
  if (mc > 0 && monthCostEur() >= mc) {
    return { ok: false, reason: `Mesačný limit nákladov (${mc} €) je vyčerpaný. Zvýš ho v Nastavenia → AI, ak treba.` };
  }
  return { ok: true };
}

// Zaznamená jedno čítanie (po úspechu).
function record(costUsd) {
  db.prepare(
    `INSERT INTO ai_usage (day, reads, cost_usd, updated_at) VALUES (?,1,?,datetime('now'))
     ON CONFLICT(day) DO UPDATE SET reads = reads + 1, cost_usd = cost_usd + excluded.cost_usd, updated_at = datetime('now')`
  ).run(today(), costUsd || 0);
}

function stats() {
  return {
    todayReads: todayReads(), maxReadsDay: maxReadsDay(),
    monthCostEur: monthCostEur(), maxCostMonthEur: maxCostMonthEur(),
    monthReads: (db.prepare("SELECT COALESCE(SUM(reads),0) r FROM ai_usage WHERE day LIKE ?").get(monthPrefix() + '%').r),
  };
}

module.exports = { checkLimits, record, stats, maxReadsDay, maxCostMonthEur };

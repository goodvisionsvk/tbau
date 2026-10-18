// Čítanie smenoviek z fotky cez AI (Google Gemini alebo Claude/Anthropic).
// Kľúč, poskytovateľ a model sú v nastaveniach (app_settings, šifrované). Vráti štruktúrované dáta na kontrolu.
const fs = require('fs');
const path = require('path');
const store = require('./settings-store');
const usage = require('./ai-usage');

function cfg() {
  return {
    provider: store.get('ai_provider', 'claude'),
    model: store.get('ai_model', 'claude-sonnet-5-5'),
    apiKey: store.get('ai_api_key', ''),
  };
}
function isConfigured() { return !!cfg().apiKey; }

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.pdf': 'application/pdf', '.webp': 'image/webp' };

const PROMPT = `Toto je týždenná stavebná smenovka firmy TBAU (dvojjazyčná SK/DE). Prečítaj ju a vráť presné dáta.
Pre KAŽDÝ riadok pracovníka vráť meno (ako je napísané) a odpracované hodiny za každý deň: pondelok(po), utorok(ut), streda(st), štvrtok(stv), piatok(pi), sobota(so), nedeľa(ne). Hodiny sú celé/desatinné čísla (napr. 9, 5, 8.5); ak deň nie je vyplnený, daj 0. Vráť aj týždenný súčet pracovníka (spolu).
Z hlavičky vráť: firma, stavba, kalendárny týždeň (kw ako číslo), dátum od (datum_od), dátum do (datum_do) a celkový súčet hodín (spolu_hodin). Dátumy vo formáte ako sú na papieri.
Pozorne prečítaj VŠETKÝCH pracovníkov v tabuľke (nevynechaj žiadny riadok). Nevymýšľaj údaje – čo nevieš prečítať, nechaj 0 alebo prázdny reťazec.`;

const JSON_SHAPE = `Vráť IBA platný JSON (žiadny iný text, žiadne markdown) v tvare:
{"firma":"","stavba":"","kw":0,"datum_od":"","datum_do":"","spolu_hodin":0,"pracovnici":[{"meno":"","po":0,"ut":0,"st":0,"stv":0,"pi":0,"so":0,"ne":0,"spolu":0}]}`;

const GEMINI_SCHEMA = {
  type: 'object',
  properties: {
    firma: { type: 'string' }, stavba: { type: 'string' }, kw: { type: 'integer' },
    datum_od: { type: 'string' }, datum_do: { type: 'string' }, spolu_hodin: { type: 'number' },
    pracovnici: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          meno: { type: 'string' }, po: { type: 'number' }, ut: { type: 'number' }, st: { type: 'number' },
          stv: { type: 'number' }, pi: { type: 'number' }, so: { type: 'number' }, ne: { type: 'number' }, spolu: { type: 'number' },
        },
        required: ['meno'],
      },
    },
  },
  required: ['pracovnici'],
};

function fileInfo(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext];
  if (!mime) throw new Error('Nepodporovaný formát súboru: ' + ext);
  return { mime, data: fs.readFileSync(filePath).toString('base64') };
}

function withTimeout(ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(timer) };
}

// vytiahne JSON z textu (aj keď je obalený v ```json ... ```)
function parseJsonLoose(text) {
  let t = (text || '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s >= 0 && e > s) t = t.slice(s, e + 1);
  return JSON.parse(t);
}

async function readGemini(c, filePath) {
  const { mime, data } = fileInfo(filePath);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(c.model)}:generateContent?key=${encodeURIComponent(c.apiKey)}`;
  const body = {
    contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mime, data } }] }],
    generationConfig: { response_mime_type: 'application/json', response_schema: GEMINI_SCHEMA, temperature: 0 },
  };
  const to = withTimeout(120000);
  let resp;
  try { resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: to.signal }); }
  finally { to.done(); }
  const txt = await resp.text();
  if (!resp.ok) throw new Error('Gemini API ' + resp.status + ': ' + txt.slice(0, 300));
  const out = JSON.parse(txt);
  const part = out && out.candidates && out.candidates[0] && out.candidates[0].content && out.candidates[0].content.parts && out.candidates[0].content.parts[0];
  if (!part || !part.text) throw new Error('API nevrátilo dáta (možno blokované alebo prázdne).');
  const u = out.usageMetadata || {};
  return { data: parseJsonLoose(part.text), usage: { input: u.promptTokenCount || 0, output: u.candidatesTokenCount || 0 } };
}

async function readClaude(c, filePath) {
  const { mime, data } = fileInfo(filePath);
  const block = mime === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: mime, data } }
    : { type: 'image', source: { type: 'base64', media_type: mime, data } };
  const body = {
    model: c.model,
    max_tokens: 8000,
    messages: [{ role: 'user', content: [block, { type: 'text', text: PROMPT + '\n\n' + JSON_SHAPE }] }],
  };
  const to = withTimeout(120000);
  let resp;
  try {
    resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': c.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body), signal: to.signal,
    });
  } finally { to.done(); }
  const txt = await resp.text();
  if (!resp.ok) throw new Error('Claude API ' + resp.status + ': ' + txt.slice(0, 300));
  const out = JSON.parse(txt);
  const textBlock = (out.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  if (!textBlock) throw new Error('API nevrátilo text (stop: ' + (out.stop_reason || '?') + ').');
  const u = out.usage || {};
  return { data: parseJsonLoose(textBlock), usage: { input: u.input_tokens || 0, output: u.output_tokens || 0 } };
}

// cena za 1M tokenov [vstup, výstup] v USD
const PRICES = {
  'claude-sonnet-5-5': [2, 10], 'claude-haiku-5-5': [0.1, 0.5], 'claude-opus-5-5': [4, 20],
};
function costUsd(provider, model, usage) {
  if (provider !== 'claude') return null; // Gemini free tier
  const p = PRICES[model] || [2, 10];
  return (usage.input / 1e6) * p[0] + (usage.output / 1e6) * p[1];
}

async function readSmenovka(filePath) {
  const c = cfg();
  if (!c.apiKey) throw new Error('AI nie je nakonfigurované (chýba API kľúč).');
  const lim = usage.checkLimits();
  if (!lim.ok) throw new Error(lim.reason);
  const res = c.provider === 'claude' ? await readClaude(c, filePath) : await readGemini(c, filePath);
  const meta = { provider: c.provider, model: c.model, usage: res.usage, costUsd: costUsd(c.provider, c.model, res.usage) };
  try { usage.record(meta.costUsd); } catch (e) { /* evidencia nesmie zhodiť čítanie */ }
  return { data: res.data, meta };
}

module.exports = { isConfigured, readSmenovka, cfg };

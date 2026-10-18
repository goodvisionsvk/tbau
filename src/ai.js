// Čítanie smenoviek z fotky cez Google Gemini (vizuálny model).
// Kľúč a model sú v nastaveniach (app_settings, šifrované). Vráti štruktúrované dáta na kontrolu.
const fs = require('fs');
const path = require('path');
const store = require('./settings-store');

function cfg() {
  return {
    apiKey: store.get('ai_api_key', ''),
    model: store.get('ai_model', 'gemini-flash-latest'),
    provider: store.get('ai_provider', 'gemini'),
  };
}
function isConfigured() { return !!cfg().apiKey; }

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.pdf': 'application/pdf', '.webp': 'image/webp' };

const PROMPT = `Toto je týždenná stavebná smenovka firmy TBAU (dvojjazyčná SK/DE). Prečítaj ju a vráť presné dáta.
Pre každý riadok pracovníka vráť meno (ako je napísané) a odpracované hodiny za každý deň: pondelok(po), utorok(ut), streda(st), štvrtok(stv), piatok(pi), sobota(so), nedeľa(ne). Hodiny sú čísla (napr. 9, 5, 8.5); ak deň nie je vyplnený, daj 0. Vráť aj týždenný súčet pracovníka (spolu).
Z hlavičky vráť: firma, stavba, kalendárny týždeň (kw ako číslo), dátum od (datum_od), dátum do (datum_do) a celkový súčet hodín (spolu_hodin). Dátumy vo formáte ako sú na papieri.
Nevymýšľaj údaje – ak niečo nevieš prečítať, nechaj prázdne (0 alebo prázdny reťazec).`;

const SCHEMA = {
  type: 'object',
  properties: {
    firma: { type: 'string' },
    stavba: { type: 'string' },
    kw: { type: 'integer' },
    datum_od: { type: 'string' },
    datum_do: { type: 'string' },
    spolu_hodin: { type: 'number' },
    pracovnici: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          meno: { type: 'string' },
          po: { type: 'number' }, ut: { type: 'number' }, st: { type: 'number' },
          stv: { type: 'number' }, pi: { type: 'number' }, so: { type: 'number' }, ne: { type: 'number' },
          spolu: { type: 'number' },
        },
        required: ['meno'],
      },
    },
  },
  required: ['pracovnici'],
};

// Prečíta smenovku z obrázka/PDF; vráti rozparsovaný objekt (alebo vyhodí chybu).
async function readSmenovka(filePath) {
  const c = cfg();
  if (!c.apiKey) throw new Error('AI nie je nakonfigurované (chýba API kľúč).');
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext];
  if (!mime) throw new Error('Nepodporovaný formát súboru: ' + ext);
  const data = fs.readFileSync(filePath).toString('base64');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(c.model)}:generateContent?key=${encodeURIComponent(c.apiKey)}`;
  const body = {
    contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mime, data } }] }],
    generationConfig: { response_mime_type: 'application/json', response_schema: SCHEMA, temperature: 0 },
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120000);
  let resp;
  try {
    resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
  } finally { clearTimeout(timer); }
  const txt = await resp.text();
  if (!resp.ok) throw new Error('Gemini API ' + resp.status + ': ' + txt.slice(0, 300));
  let out;
  try { out = JSON.parse(txt); } catch (e) { throw new Error('Neplatná odpoveď API.'); }
  const part = out && out.candidates && out.candidates[0] && out.candidates[0].content && out.candidates[0].content.parts && out.candidates[0].content.parts[0];
  const jsonText = part && part.text;
  if (!jsonText) throw new Error('API nevrátilo dáta (možno blokované alebo prázdne).');
  let parsed;
  try { parsed = JSON.parse(jsonText); } catch (e) { throw new Error('Nepodarilo sa rozparsovať výsledok.'); }
  return parsed;
}

module.exports = { isConfigured, readSmenovka, cfg };

// Inicializácia databázy: admin účet, aplikácie (moduly) a štartovacie úlohy.
// Spúšťa sa cez `npm run init-db`. Je idempotentný (nevytvára duplicity).
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./index');

function genPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(14);
  let out = '';
  for (let i = 0; i < 14; i++) out += chars[bytes[i] % chars.length];
  return out;
}

// --- Admin účet ---
const adminEmail = (process.env.ADMIN_EMAIL || 'admin@tbau.sk').toLowerCase();
const existingAdmin = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
if (!existingAdmin) {
  const tempPassword = process.env.ADMIN_PASSWORD || genPassword();
  const hash = bcrypt.hashSync(tempPassword, 12);
  db.prepare(
    'INSERT INTO users (email, password_hash, full_name, role, must_change_password) VALUES (?,?,?,?,1)'
  ).run(adminEmail, hash, 'Administrátor', 'admin');
  console.log('\n==============================================');
  console.log(' VYTVORENÝ ADMIN ÚČET');
  console.log(' E-mail:  ' + adminEmail);
  console.log(' Heslo:   ' + tempPassword);
  console.log(' (heslo je dočasné – po prihlásení si ho zmeň)');
  console.log('==============================================\n');
} else {
  console.log('Admin účet už existuje: ' + adminEmail);
}

// --- Aplikácie (moduly) ---
const apps = [
  {
    name: 'RSV – Riadenie stavebnej výroby',
    slug: 'rsv',
    description:
      'Sledovanie priebehu na stavbách, kontrola rozpočtu (plán vs. skutočnosť), výkazy prác.',
    status: 'planned',
    icon: '🏗️',
    sort_order: 1,
  },
  {
    name: 'Objednávkový systém',
    slug: 'objednavky',
    description: 'Evidencia a schvaľovanie objednávok materiálu a služieb.',
    status: 'planned',
    icon: '🧾',
    sort_order: 2,
  },
  {
    name: 'Dochádzka',
    slug: 'dochadzka',
    description:
      'Evidencia odpracovaných hodín na stavbách zo smenoviek, žiadosti o zmenu a mesačné reporty.',
    status: 'active',
    icon: '🕒',
    sort_order: 0,
  },
];
const insertApp = db.prepare(
  'INSERT OR IGNORE INTO apps (name, slug, description, status, icon, sort_order) VALUES (@name,@slug,@description,@status,@icon,@sort_order)'
);
apps.forEach((a) => insertApp.run(a));
console.log('Aplikácie pripravené: ' + apps.length);

// --- Štartovacie úlohy (budovanie portálu) ---
if (db.prepare('SELECT COUNT(*) c FROM tasks').get().c === 0) {
  const tasks = [
    ['Nasadiť HTTPS (Let’s Encrypt) pre tbau.goodvision.sk', 'high'],
    ['Opraviť DNS – pridať A záznam namiesto TXT', 'high'],
    ['Modul RSV – návrh dátového modelu a obrazoviek', 'medium'],
    ['Import zamestnancov / používateľov TBAU', 'medium'],
    ['Neskôr: prechod na doménu portal.tbau.sk', 'low'],
  ];
  const ins = db.prepare('INSERT INTO tasks (title, priority) VALUES (?,?)');
  tasks.forEach((t) => ins.run(t[0], t[1]));
  console.log('Štartovacie úlohy pridané: ' + tasks.length);
}

// --- Evidencia práce (čas, tokeny) – odhad podľa míľnikov ---
if (db.prepare('SELECT COUNT(*) c FROM work_log').get().c === 0) {
  // Vývojový čas aj tokeny Claude Code sessions sa počítajú automaticky (SessionEnd hook).
  // Tu sú len ručné položky, ktoré neboli Claude Code session (stretnutia).
  const work = [
    ['2026-08-10', 'Stretnutie so zadávateľom – zadanie (portál, dochádzka)', 1, 0],
    ['2026-10-13', 'Stretnutie so zadávateľom – klientov CRM a smerovanie', 1, 0],
  ];
  const insW = db.prepare('INSERT INTO work_log (entry_date, title, hours, tokens) VALUES (?,?,?,?)');
  work.forEach((w) => insW.run(w[0], w[1], w[2], w[3]));

  // Rozpis vykonaných prác (čo sa spravilo – pre klienta), bez hodín (čas sa meria automaticky)
  const activities = [
    ['2026-08-12', 'Založenie projektu a nasadenie na server (doména tbau.goodvision.sk, HTTPS, zabezpečenie, zálohy)'],
    ['2026-08-23', 'Firemný portál – základ: prihlásenie, používatelia, role, prehľad'],
    ['2026-08-24', 'Responzívna mobilná verzia + automatické kontroly funkčnosti'],
    ['2026-10-01', 'Modul Dochádzka: zamestnanci, stavby, prepis smenoviek, hodiny (týždeň/mesiac), žiadosti o zmenu'],
    ['2026-10-01', 'Mesačné reporty dochádzky + export pre mzdy (CSV)'],
    ['2026-10-13', 'HR: pozície zamestnancov, druh robotníka, filtre, archivácia; tabuľka so stavbou'],
    ['2026-10-13', 'Nový moderný dizajn portálu + ikony'],
    ['2026-10-13', 'Nahrávanie smenoviek ako dokladov; reálna stavba a zamestnanci zo smenovky'],
    ['2026-10-13', 'Príprava integrácie klientovho CRM (analýza zadania, prototyp)'],
  ];
  const insA = db.prepare('INSERT INTO work_log (entry_date, title, hours, tokens) VALUES (?,?,0,0)');
  activities.forEach((a) => insA.run(a[0], a[1]));
  console.log('Evidencia práce: ' + work.length + ' + rozpis ' + activities.length + '.');
}

console.log('Hotovo.');

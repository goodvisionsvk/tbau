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
    ['2026-08-12', 'Založenie projektu a nasadenie na server (doména, HTTPS, zabezpečenie, zálohy)'],
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

// --- Demo zákazníci (Obchod/CRM) z prototypu – ak je tabuľka prázdna ---
if (db.prepare('SELECT COUNT(*) c FROM customers').get().c === 0) {
  // [name, status, work_type, hourly_price, min_group, payment_terms, payment_discipline, rating, note, [contacts]]
  // contact: [name, role, emailOrPhone, primary]
  const cs = [
    ['Muster Bau GmbH','aktivny','hodinovka',35,'dvojice','30 dní','Oneskorené',4,'Fakturovať mesačne, hodiny schvaľuje Polier.',
      [['Max Mustermann','Bauleiter','+49 000 000 000',1],['Erika Beispiel','Schvaľovateľ hodín','erika@example.de',0],['Hans Probe','Polier','+49 000 000 001',0]]],
    ['Beispiel Hochbau AG','ponuka','lv',null,'skupina','14 dní','V poriadku',null,'',
      [['Anna Muster','Obchodný kontakt','anna@example.de',1]]],
    ['Demo Fassaden GmbH','aktivny','hodinovka',34,'dvojice','30 dní','Neuhradené',3,'Dve faktúry čakajú na úhradu.',
      [['Jan Beispiel','Obchodný kontakt','jan@example.de',1],['Petra Probe','Fakturačný kontakt','petra@example.de',0]]],
    ['Probe Trockenbau GmbH','osloveny',null,null,null,null,null,null,'',
      [['Tom Test','Obchodný kontakt','tom@example.de',0]]],
    ['Test Gerüstbau GmbH','aktivny','hodinovka',33,'jednotlivci','21 dní','V poriadku',5,'',
      [['Lukas Muster','Polier','+49 000 000 002',1]]],
    ['Beispiel Putz GmbH','potencialny',null,null,null,null,null,null,'Z databázy firiem.',[]],
    ['Muster Dach GmbH','pozastaveny','hodinovka',36,'dvojice','30 dní','V poriadku',4,'Zákazník má dočasne plné kapacity.',
      [['Eva Dach','Obchodný kontakt','eva@example.de',1]]],
    ['Ukážka Estrich GmbH','ukonceny','hodinovka',35,'dvojice','30 dní','V poriadku',3,'',
      [['Karl Estrich','Obchodný kontakt','karl@example.de',0]]],
    ['Probe Maler GmbH','osloveny',null,null,null,null,null,null,'',
      [['Mia Maler','Obchodný kontakt','mia@example.de',0]]],
  ];
  const insC = db.prepare(`INSERT INTO customers (name,country,status,work_type,hourly_price,min_group,payment_terms,payment_discipline,rating,note) VALUES (?,?,?,?,?,?,?,?,?,?)`);
  const insK = db.prepare('INSERT INTO contacts (customer_id,name,role,email,phone,is_primary) VALUES (?,?,?,?,?,?)');
  cs.forEach((c) => {
    const id = insC.run(c[0], 'Nemecko', c[1], c[2], c[3], c[4], c[5], c[6], c[7], c[8]).lastInsertRowid;
    (c[9] || []).forEach((k) => {
      const isEmail = /@/.test(k[2]);
      insK.run(id, k[0], k[1], isEmail ? k[2] : null, isEmail ? null : k[2], k[3]);
    });
  });
  console.log('Demo zákazníci: ' + cs.length + ' (vymyslené z prototypu).');
}

console.log('Hotovo.');

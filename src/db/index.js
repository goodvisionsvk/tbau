const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('../config');

// zabezpeč, že adresár pre databázu existuje
fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// --- Schéma ---
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user',            -- user | admin
  active INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login TEXT
);

CREATE TABLE IF NOT EXISTS apps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'planned',        -- planned | in_progress | active
  icon TEXT DEFAULT '📦',
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT,
  client TEXT,
  address TEXT,
  budget REAL,
  status TEXT NOT NULL DEFAULT 'planned',         -- planned | active | done | paused
  start_date TEXT,
  end_date TEXT,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo',            -- todo | in_progress | done
  priority TEXT NOT NULL DEFAULT 'medium',        -- low | medium | high
  category TEXT DEFAULT 'portal',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER REFERENCES users(id),
  done_at TEXT
);
`);

// --- Schéma: Dochádzkový modul ---
db.exec(`
CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  employee_number TEXT,
  birth_date TEXT,
  phone TEXT,
  address TEXT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- priradenie zamestnancov (a parťáka) na stavbu (projekt)
CREATE TABLE IF NOT EXISTS site_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  is_foreman INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, employee_id)
);

-- smenovky (dochádzkové listy) nahraté ako dokument za stavbu + týždeň
CREATE TABLE IF NOT EXISTS shift_sheets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  week INTEGER NOT NULL,
  file_path TEXT,
  original_name TEXT,
  mime TEXT,
  size INTEGER,
  note TEXT,
  uploaded_by INTEGER REFERENCES users(id),
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- dochádzka: odpracované hodiny na deň, zamestnanec, stavba
CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  work_date TEXT NOT NULL,                 -- YYYY-MM-DD
  hours REAL NOT NULL DEFAULT 0,
  shift_sheet_id INTEGER REFERENCES shift_sheets(id) ON DELETE SET NULL,
  note TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  UNIQUE(employee_id, project_id, work_date)
);

-- žiadosti zamestnancov o zmenu dochádzky (idú na parťáka)
CREATE TABLE IF NOT EXISTS change_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  work_date TEXT,
  requested_hours REAL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',      -- open | approved | rejected
  response TEXT,
  created_by INTEGER REFERENCES users(id),
  handled_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_attendance_emp_date ON attendance(employee_id, work_date);
CREATE INDEX IF NOT EXISTS idx_attendance_project ON attendance(project_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON change_requests(status);
CREATE INDEX IF NOT EXISTS idx_sheets_proj_week ON shift_sheets(project_id, year, week);

-- evidencia práce na projekte (čas, tokeny, cena) – pre prehľad pre zadávateľa
CREATE TABLE IF NOT EXISTS work_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_date TEXT NOT NULL,
  title TEXT NOT NULL,
  hours REAL NOT NULL DEFAULT 0,
  tokens INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);
// --- Schéma: Obchod (CRM) ---
db.exec(`
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  country TEXT,
  city TEXT,
  address TEXT,
  status TEXT NOT NULL DEFAULT 'potencialny',  -- potencialny/osloveny/ponuka/aktivny/pozastaveny/ukonceny
  owner TEXT,                 -- zodpovedný obchodník
  source TEXT,                -- zdroj kontaktu
  billing_info TEXT,          -- IČO / USt-IdNr, fakturačná adresa
  work_type TEXT,             -- hodinovka / lv / obe
  hourly_price REAL,
  min_group TEXT,             -- jednotlivci / dvojice / skupina
  payment_terms TEXT,
  payment_discipline TEXT,
  rating INTEGER,
  end_reason TEXT,
  note TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  email TEXT,
  phone TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- dopyty: ponuka voľných ľudí zákazníkovi
CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  title TEXT,
  profession TEXT,
  free_from TEXT,             -- odkedy sú voľní
  price TEXT,                 -- cena (text)
  references_text TEXT,       -- referencie stavieb
  message TEXT,
  status TEXT NOT NULL DEFAULT 'new',  -- new/sent/responded/closed
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS inquiry_employees (
  inquiry_id INTEGER NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  PRIMARY KEY (inquiry_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_contacts_customer ON contacts(customer_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_customer ON inquiries(customer_id);
`);

// --- Migrácie: doplnenie stĺpcov do existujúcich tabuliek (idempotentné) ---
function ensureColumn(table, col, type) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
}
ensureColumn('employees', 'position', 'TEXT'); // HR pozícia: majitel/obchodnik/uctovnik/majster/robotnik
ensureColumn('employees', 'trade', 'TEXT'); // druh robotníka (len pre robotník)
ensureColumn('projects', 'bauleiter', 'TEXT'); // stavbyvedúci
ensureColumn('projects', 'polier', 'TEXT'); // polier
ensureColumn('projects', 'kw_od', 'INTEGER'); // kalendárny týždeň od
ensureColumn('projects', 'kw_do', 'INTEGER'); // kalendárny týždeň do
ensureColumn('work_log', 'session_ref', 'TEXT'); // Claude Code session id (pre automatické tokeny)
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_worklog_session ON work_log(session_ref)'); // SQLite povoľuje viac NULL

// Bezpečnosť hesiel: kedy bolo heslo naposledy zmenené (pre vynútenú obmenu raz za rok).
ensureColumn('users', 'password_changed_at', 'TEXT');
// Doplň chýbajúce hodnoty dátumom vytvorenia účtu (odvtedy sa počíta vek hesla).
db.exec("UPDATE users SET password_changed_at = COALESCE(created_at, datetime('now')) WHERE password_changed_at IS NULL");

// Nastavenia aplikácie (kľúč–hodnota), napr. SMTP konfigurácia editovateľná z portálu.
db.exec(`
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Samoobslužné žiadosti o reset hesla (bez SMTP – vybavuje admin, heslo odovzdá mimo systému).
db.exec(`
CREATE TABLE IF NOT EXISTS password_reset_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open',   -- open | done
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  handled_by INTEGER REFERENCES users(id),
  handled_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_resetreq_status ON password_reset_requests(status);
`);

// Poznámka: tabuľku "sessions" si vytvára a spravuje better-sqlite3-session-store.

module.exports = db;

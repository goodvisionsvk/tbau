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
// Poznámka: tabuľku "sessions" si vytvára a spravuje better-sqlite3-session-store.

module.exports = db;

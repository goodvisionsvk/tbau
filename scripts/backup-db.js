#!/usr/bin/env node
// Denná konzistentná záloha SQLite databázy portálu + rotácia (gzip).
// Používa online backup API (better-sqlite3), takže je bezpečná aj počas behu aplikácie (WAL).
// Spúšťa ju systemd timer `tbau-backup.timer` (1× denne). Výstup: backups/tbau-<dátum>.db.gz
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const Database = require('better-sqlite3');
const config = require('../src/config');

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');
const KEEP = parseInt(process.env.BACKUP_KEEP || '30', 10); // koľko záloh ponechať (dní)

fs.mkdirSync(BACKUP_DIR, { recursive: true });

const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-'); // 2026-10-14-08-00-00
const tmp = path.join(BACKUP_DIR, `.tmp-${stamp}.db`);
const dest = path.join(BACKUP_DIR, `tbau-${stamp}.db.gz`);

(async () => {
  // 1) konzistentná kópia databázy
  const db = new Database(config.dbPath, { readonly: true });
  await db.backup(tmp);
  db.close();

  // 2) komprimácia
  await new Promise((resolve, reject) => {
    fs.createReadStream(tmp)
      .pipe(zlib.createGzip({ level: 9 }))
      .pipe(fs.createWriteStream(dest))
      .on('finish', resolve)
      .on('error', reject);
  });
  fs.unlinkSync(tmp);

  // 3) rotácia – ponechaj posledných KEEP
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => /^tbau-.*\.db\.gz$/.test(f))
    .sort();
  for (const f of files.slice(0, Math.max(0, files.length - KEEP))) {
    fs.unlinkSync(path.join(BACKUP_DIR, f));
  }

  const size = fs.statSync(dest).size;
  console.log(`Záloha OK: ${path.basename(dest)} (${(size / 1024).toFixed(1)} kB), ponechaných ${Math.min(files.length, KEEP)}.`);
})().catch((e) => {
  try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) {}
  console.error('Záloha ZLYHALA:', e.message);
  process.exit(1);
});

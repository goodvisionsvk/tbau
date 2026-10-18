#!/usr/bin/env node
// Denná záloha portálu do izolovaného export priečinka, ktorý si NAS Synology ťahá cez rsync.
// Export priečinok (backups/) obsahuje LEN to, čo má NAS vidieť:
//   backups/db/tbau-<dátum>.db.gz   – konzistentné kópie databázy (gzip, rotácia)
//   backups/uploads/                – zrkadlo nahratých dokumentov (smenovky), prírastkovo
// Zámerne NEobsahuje .env ani živú databázu (tie ostávajú mimo dosahu NAS účtu).
// Spúšťa systemd timer `tbau-backup.timer` (1× denne).
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');
const Database = require('better-sqlite3');
const config = require('../src/config');

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');
const DB_DIR = path.join(BACKUP_DIR, 'db');
const UPLOADS_MIRROR = path.join(BACKUP_DIR, 'uploads');
const KEEP = parseInt(process.env.BACKUP_KEEP || '30', 10); // koľko záloh DB ponechať

fs.mkdirSync(DB_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_MIRROR, { recursive: true });

const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-'); // 2026-10-14-02-30-00
const tmp = path.join(DB_DIR, `.tmp-${stamp}.db`);
const dest = path.join(DB_DIR, `tbau-${stamp}.db.gz`);

(async () => {
  // 1) konzistentná kópia databázy (online backup API – bezpečné aj počas behu, WAL)
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

  // 3) rotácia DB záloh – ponechaj posledných KEEP
  const files = fs.readdirSync(DB_DIR).filter((f) => /^tbau-.*\.db\.gz$/.test(f)).sort();
  for (const f of files.slice(0, Math.max(0, files.length - KEEP))) fs.unlinkSync(path.join(DB_DIR, f));

  // 4) zrkadlo uploadov (prírastkovo – prenesú sa len nové/zmenené súbory)
  let uploadsNote = '';
  try {
    if (fs.existsSync(config.uploadsDir)) {
      execFileSync('rsync', ['-a', '--delete', config.uploadsDir + '/', UPLOADS_MIRROR + '/']);
      uploadsNote = ', uploads zrkadlené';
    }
  } catch (e) {
    uploadsNote = ', uploads CHYBA: ' + e.message;
  }

  // 5) zašifrovaná záloha .env (GPG verejným kľúčom) – server vie len šifrovať, dešifruje len súkromný kľúč (u používateľa)
  let envNote = '';
  try {
    const pub = path.join(__dirname, '..', 'deploy', 'secrets-pubkey.asc');
    const envFile = path.join(__dirname, '..', '.env');
    if (fs.existsSync(pub) && fs.existsSync(envFile)) {
      const envDest = path.join(DB_DIR, 'env.gpg');
      const gpgHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tbaugpg-'));
      try {
        execFileSync('gpg', ['--batch', '--yes', '--trust-model', 'always', '--recipient-file', pub,
          '--encrypt', '--output', envDest, envFile], { env: Object.assign({}, process.env, { GNUPGHOME: gpgHome }) });
        envNote = ', .env zašifrované (env.gpg)';
      } finally {
        fs.rmSync(gpgHome, { recursive: true, force: true });
      }
    }
  } catch (e) {
    envNote = ', .env šifrovanie CHYBA: ' + e.message;
  }

  const size = fs.statSync(dest).size;
  console.log(`Záloha OK: db/${path.basename(dest)} (${(size / 1024).toFixed(1)} kB), ponechaných ${Math.min(files.length, KEEP)}${uploadsNote}${envNote}.`);
})().catch((e) => {
  try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) {}
  console.error('Záloha ZLYHALA:', e.message);
  process.exit(1);
});

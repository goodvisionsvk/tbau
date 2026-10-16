const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('./config');

const sheetsDir = path.join(config.uploadsDir, 'smenovky');
fs.mkdirSync(sheetsDir, { recursive: true });

const ALLOWED = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'application/pdf': '.pdf',
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, sheetsDir),
  filename: (req, file, cb) => {
    const ext = ALLOWED[file.mimetype] || path.extname(file.originalname) || '';
    const name = 'smenovka_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex') + ext;
    cb(null, name);
  },
});

const uploadSheet = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
  fileFilter: (req, file, cb) => {
    if (ALLOWED[file.mimetype]) return cb(null, true);
    cb(new Error('Povolené sú len súbory JPG, PNG alebo PDF.'));
  },
}).single('file');

// --- Fotky k referenčným stavbám (len obrázky, viac naraz) ---
const refDir = path.join(config.uploadsDir, 'references');
fs.mkdirSync(refDir, { recursive: true });

const IMG = { 'image/jpeg': '.jpg', 'image/png': '.png' };

const refStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, refDir),
  filename: (req, file, cb) => {
    const ext = IMG[file.mimetype] || path.extname(file.originalname) || '';
    cb(null, 'ref_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex') + ext);
  },
});

const uploadRefImages = multer({
  storage: refStorage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB na fotku
  fileFilter: (req, file, cb) => {
    if (IMG[file.mimetype]) return cb(null, true);
    cb(new Error('Povolené sú len obrázky JPG alebo PNG.'));
  },
}).array('images', 12);

// --- Dokumenty k vozidlám (JPG/PNG/PDF, po jednom) ---
const vehDir = path.join(config.uploadsDir, 'vehicles');
fs.mkdirSync(vehDir, { recursive: true });

const vehStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, vehDir),
  filename: (req, file, cb) => {
    const ext = ALLOWED[file.mimetype] || path.extname(file.originalname) || '';
    cb(null, 'veh_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex') + ext);
  },
});

const uploadVehicleDoc = multer({
  storage: vehStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED[file.mimetype]) return cb(null, true);
    cb(new Error('Povolené sú len súbory JPG, PNG alebo PDF.'));
  },
}).single('file');

module.exports = { uploadSheet, sheetsDir, uploadRefImages, refDir, uploadVehicleDoc, vehDir };

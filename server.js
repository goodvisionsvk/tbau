const path = require('path');
const express = require('express');
const session = require('express-session');
const SqliteStore = require('better-sqlite3-session-store')(session);
const helmet = require('helmet');
const morgan = require('morgan');
const expressLayouts = require('express-ejs-layouts');

const config = require('./src/config');
const db = require('./src/db');
const constants = require('./src/constants');
const csrf = require('./src/middleware/csrf');

const app = express();

if (config.trustProxy) app.set('trust proxy', 1);

// Predvolené locals (dostupné aj v chybových stránkach pred spustením middleware)
app.locals.company = constants.company;
app.locals.nav = constants.nav;
app.locals.currentUser = null;
app.locals.active = '';

// --- Bezpečnostné hlavičky (helmet) ---
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  })
);

// --- Logovanie požiadaviek (audit) ---
app.use(morgan(config.env === 'production' ? 'combined' : 'dev'));

// --- Views ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/app');

// --- Statické súbory ---
app.use('/static', express.static(path.join(__dirname, 'public')));

// --- Telo požiadaviek ---
app.use(express.urlencoded({ extended: false }));

// --- Session ---
app.use(
  session({
    store: new SqliteStore({
      client: db,
      expired: { clear: true, intervalMs: 15 * 60 * 1000 },
    }),
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    name: 'tbau.sid',
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.secureCookies,
      maxAge: 8 * 60 * 60 * 1000, // 8 hodín
    },
  })
);

// --- Načítanie prihláseného používateľa ---
app.use((req, res, next) => {
  if (req.session.userId) {
    req.user = db
      .prepare('SELECT id, email, full_name, role, active, must_change_password FROM users WHERE id = ?')
      .get(req.session.userId);
    if (!req.user || !req.user.active) {
      req.session.destroy(() => {});
      req.user = null;
    }
  }
  res.locals.currentUser = req.user || null;
  res.locals.company = constants.company;
  res.locals.nav = constants.nav;
  res.locals.active = '';
  next();
});

// --- CSRF ochrana ---
app.use(csrf);

// --- Routy ---
app.use('/', require('./src/routes/auth'));
app.use('/', require('./src/routes/pages'));
app.use('/users', require('./src/routes/users'));
app.use('/apps', require('./src/routes/apps'));
app.use('/projects', require('./src/routes/projects'));
app.use('/tasks', require('./src/routes/tasks'));

// --- 404 ---
app.use((req, res) => {
  res.status(404).render('error', {
    title: '404 – Nenájdené',
    message: 'Požadovaná stránka neexistuje.',
  });
});

// --- Chybový handler ---
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', {
    title: 'Chyba servera',
    message: config.env === 'production' ? 'Nastala neočakávaná chyba.' : err.message,
  });
});

app.listen(config.port, () => {
  console.log(`TBAU portál beží na porte ${config.port} (${config.env})`);
});

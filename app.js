require('dotenv').config();
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const flash = require('connect-flash');
const path = require('path');
const Database = require('better-sqlite3');
const Settings = require('./models/Settings');
const formatter = require('./utils/formatter');

const app = express();
const PORT = process.env.PORT || 3000;

function verifyDatabaseSchema() {
  try {
    const dbPath = path.join(__dirname, 'hotspot.db');
    const db = new Database(dbPath);

    const settingsColumns = db.prepare('PRAGMA table_info(settings)').all();
    const columnNames = settingsColumns.map((col) => col.name);
    let schemaUpdated = false;

    if (!columnNames.includes('hotspot_dns_name')) {
      console.log('[Schema Check] Adding hotspot_dns_name column...');
      db.exec('ALTER TABLE settings ADD COLUMN hotspot_dns_name TEXT');
      schemaUpdated = true;
    }

    if (!columnNames.includes('telegram_bot_token')) {
      console.log('[Schema Check] Adding telegram_bot_token column...');
      db.exec('ALTER TABLE settings ADD COLUMN telegram_bot_token TEXT');
      schemaUpdated = true;
    }

    if (!columnNames.includes('telegram_chat_id')) {
      console.log('[Schema Check] Adding telegram_chat_id column...');
      db.exec('ALTER TABLE settings ADD COLUMN telegram_chat_id TEXT');
      schemaUpdated = true;
    }

    if (!columnNames.includes('school_name')) {
      console.log('[Schema Check] Adding school_name column...');
      db.exec("ALTER TABLE settings ADD COLUMN school_name TEXT NOT NULL DEFAULT 'SMAN 1 CONTOH'");
      db.exec("UPDATE settings SET school_name = 'SMAN 1 CONTOH' WHERE school_name IS NULL OR TRIM(school_name) = ''");
      schemaUpdated = true;
    }

    db.close();

    if (schemaUpdated) {
      console.log('[Schema Check] ✓ Settings schema updated successfully');
    } else {
      console.log('[Schema Check] ✓ Settings schema verified (all columns exist)');
    }
  } catch (error) {
    console.error('[Schema Check] Error verifying schema:', error.message);
  }
}

verifyDatabaseSchema();

app.use(
  session({
    store: new SQLiteStore({
      db: 'hotspot.db',
      dir: './',
      table: 'sessions'
    }),
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-this-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000
    }
  })
);

app.use(flash());

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  res.locals.session = req.session;
  res.locals.formatter = formatter;
  res.locals.messages = {
    success: req.flash('success'),
    error: req.flash('error'),
    warning: req.flash('warning')
  };
  try {
    res.locals.settings = Settings.get();
  } catch (error) {
    console.error('[Settings Middleware] Failed to load settings:', error.message);
    res.locals.settings = {
      school_name: 'SMAN 1 CONTOH'
    };
  }
  next();
});

const routes = require('./routes');
app.use('/', routes);

app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).render('error', {
    title: 'Error',
    message: 'Terjadi kesalahan pada server',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

app.use((req, res) => {
  res.status(404).render('error', {
    title: '404 - Not Found',
    message: 'Halaman tidak ditemukan'
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Make sure to run "npm run setup-db" to initialize the database');
});

module.exports = app;

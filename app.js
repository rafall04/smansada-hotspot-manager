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

    // CRITICAL: Set journal mode to DELETE to prevent WAL file permission issues
    try {
      const journalMode = db.prepare('PRAGMA journal_mode').get();
      if (journalMode && journalMode.journal_mode && journalMode.journal_mode.toUpperCase() === 'WAL') {
        console.log('[Schema Check] Switching from WAL to DELETE journal mode to prevent permission issues');
        db.exec('PRAGMA journal_mode=DELETE');
        console.log('[Schema Check] ✓ Journal mode set to DELETE');
      }
    } catch (pragmaError) {
      console.warn('[Schema Check] Could not set journal mode:', pragmaError.message);
    }

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
  // CRITICAL: Load settings with error handling to prevent middleware crash
  // Settings.get() now has built-in retry logic and always returns defaults on error
  // This try-catch is extra safety layer
  try {
    res.locals.settings = Settings.get();
  } catch (error) {
    // This should not happen as Settings.get() now returns defaults on error
    // But add extra safety to ensure middleware always continues
    console.error('[Middleware] Failed to load settings (unexpected):', error.message);
    console.error('[Middleware] Error code:', error.code);
    res.locals.settings = {
      router_ip: '192.168.88.1',
      router_port: 8728,
      router_user: 'admin',
      router_password_encrypted: '',
      hotspot_dns_name: '',
      telegram_bot_token: '',
      telegram_chat_id: '',
      school_name: 'SMAN 1 CONTOH'
    };
  }
  next();
});

const routes = require('./routes');
app.use('/', routes);

// CRITICAL: Global error handler to catch unhandled errors
// This prevents SQLITE_IOERR from crashing the entire application
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  
  // Enhanced logging for SQLITE_IOERR
  if (err.code && (err.code.includes('SQLITE_IOERR') || err.code.includes('IOERR'))) {
    console.error('='.repeat(60));
    console.error('⚠️  UNHANDLED SQLITE I/O ERROR IN REQUEST');
    console.error('='.repeat(60));
    console.error('Error:', err.message);
    console.error('Code:', err.code);
    console.error('Path:', req.path);
    console.error('Method:', req.method);
    console.error('='.repeat(60));
  }
  
  if (!res.headersSent) {
    // Don't send error details to client in production
    const errorMessage = process.env.NODE_ENV === 'development' 
      ? `Internal Server Error: ${err.message}` 
      : 'Internal Server Error';
    res.status(500).render('error', {
      title: 'Error',
      message: 'Terjadi kesalahan pada server',
      error: process.env.NODE_ENV === 'development' ? err : {}
    });
  }
});

// CRITICAL: Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  if (reason && reason.code && (reason.code.includes('SQLITE_IOERR') || reason.code.includes('IOERR'))) {
    console.error('⚠️  SQLITE I/O ERROR in unhandled promise rejection');
    console.error('This indicates a database access issue. Check permissions and journal mode.');
  }
});

// CRITICAL: Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  if (error.code && (error.code.includes('SQLITE_IOERR') || error.code.includes('IOERR'))) {
    console.error('⚠️  SQLITE I/O ERROR in uncaught exception');
    console.error('Application will continue but database operations may fail.');
    console.error('Please fix file permissions and restart the application.');
  }
  // Don't exit - let the application continue with error handling
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

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const flash = require('connect-flash');
const path = require('path');
const cron = require('node-cron');
const { getDatabase, closeDatabase } = require('./models/db');
const Settings = require('./models/Settings');
const formatter = require('./utils/formatter');
const { backupDatabase } = require('./utils/backupHelper');
const { sendTelegramDocument, sendTelegramMessage, escapeHtml } = require('./services/notificationService');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', true);

function verifyDatabaseSchema() {
  try {
    const db = getDatabase();

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

    if (!columnNames.includes('default_hotspot_profile')) {
      console.log('[Schema Check] Adding default_hotspot_profile column...');
      db.exec('ALTER TABLE settings ADD COLUMN default_hotspot_profile TEXT');
      schemaUpdated = true;
    }

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
  
  const settings = Settings.get();
  res.locals.settings = settings;
  next();
});

const routes = require('./routes');
app.use('/', routes);

app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  
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

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  if (reason && reason.code && (reason.code.includes('SQLITE_IOERR') || reason.code.includes('IOERR'))) {
    console.error('⚠️  SQLITE I/O ERROR in unhandled promise rejection');
    console.error('This indicates a database access issue. Check permissions and journal mode.');
  }
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  if (error.code && (error.code.includes('SQLITE_IOERR') || error.code.includes('IOERR'))) {
    console.error('⚠️  SQLITE I/O ERROR in uncaught exception');
    console.error('Application will continue but database operations may fail.');
    console.error('Please fix file permissions and restart the application.');
  }
});

app.use((req, res) => {
  res.status(404).render('error', {
    title: '404 - Not Found',
    message: 'Halaman tidak ditemukan'
  });
});

process.on('SIGINT', () => {
  console.log('\n[SIGINT] Received SIGINT, closing database connection...');
  closeDatabase();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[SIGTERM] Received SIGTERM, closing database connection...');
  closeDatabase();
  process.exit(0);
});

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

async function performAutoBackup() {
  try {
    console.log('[AutoBackup] Starting scheduled backup...');
    
    const backupResult = await backupDatabase();
    
    if (!backupResult.success) {
      throw new Error('Backup failed');
    }

    console.log('[AutoBackup] ✓ Backup created:', backupResult.backupFilename);
    console.log('[AutoBackup]   Size:', backupResult.backupSizeFormatted);

    const settings = Settings.get();
    
    if (!settings.telegram_bot_token || !settings.telegram_chat_id) {
      console.log('[AutoBackup] ⚠️  Telegram not configured, skipping upload');
      return;
    }

    const { formatActivityMessage } = require('./services/notificationService');
    
    const details = `${backupResult.backupFilename} | ${backupResult.backupSizeFormatted} | ${backupResult.integrityOk ? 'Integrity OK' : 'Integrity Warning'}`;
    const caption = formatActivityMessage('BACKUP_DATABASE', 'System', 'system', details, 'unknown');

    console.log('[AutoBackup] Uploading to Telegram...');
    
    const uploadResult = await sendTelegramDocument(
      backupResult.backupPath,
      caption
    );

    if (uploadResult.success) {
      console.log('[AutoBackup] ✓ Backup uploaded to Telegram successfully');
    } else {
      console.error('[AutoBackup] ✗ Failed to upload to Telegram:', uploadResult.message);
      
      const errorMessage = `⚠️ <b>Database Backup Warning</b>\n\n` +
        `<b>User:</b> 🤖 <code>System</code>\n` +
        `<b>Role:</b> <b>SYSTEM</b>\n` +
        `<b>Detail:</b> <code>Backup created but upload failed: ${escapeHtml(uploadResult.message)}</code>\n` +
        `<b>File:</b> <code>${escapeHtml(backupResult.backupFilename)} (${escapeHtml(backupResult.backupSizeFormatted)})</code>\n` +
        `<b>Time:</b> <code>${escapeHtml(currentTime)}</code>\n\n` +
        `<i>Mikrotik Hotspot Manager</i>`;
      
      await sendTelegramMessage(errorMessage);
    }
  } catch (error) {
    console.error('[AutoBackup] ✗ Backup error:', error.message);
    console.error('[AutoBackup] Stack:', error.stack);
    
    const settings = Settings.get();
    if (settings.telegram_bot_token && settings.telegram_chat_id) {
      const { formatActivityMessage } = require('./services/notificationService');
      const errorDetails = `Backup failed: ${error.message}`;
      const errorMessage = formatActivityMessage('BACKUP_DATABASE', 'System', 'system', errorDetails, 'unknown');
      
      try {
        await sendTelegramMessage(errorMessage);
      } catch (telegramError) {
        console.error('[AutoBackup] Failed to send error notification:', telegramError.message);
      }
    }
  }
}

const cronSchedule = process.env.BACKUP_CRON_SCHEDULE || '0 6 * * *';
const cronTimeZone = process.env.BACKUP_CRON_TIMEZONE || 'Asia/Jakarta';

const backupTask = cron.schedule(cronSchedule, performAutoBackup, {
  scheduled: false,
  timezone: cronTimeZone
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Make sure to run "npm run setup-db" to initialize the database');
  console.log('[DB] Using shared database connection with synchronous=FULL for maximum durability');
  
  backupTask.start();
  console.log(`[AutoBackup] ✓ Scheduled backup enabled (${cronSchedule} - ${cronTimeZone})`);
  console.log('[AutoBackup]   Backup will run daily at 6:00 AM (default)');
  console.log('[AutoBackup]   Manual backup: POST /admin/settings/backup-now');
});

module.exports = {
  app,
  performAutoBackup
};

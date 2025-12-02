const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'hotspot.db');

/**
 * ⚠️ CRITICAL: File System Permissions Requirement
 * ===============================================
 * This application MUST be run under a Linux user with proper file ownership.
 * 
 * The database file and directory MUST be writable by the user running Node.js/PM2.
 * 
 * If you encounter SQLITE_IOERR_DELETE_NOENT errors:
 * 1. Check file ownership: ls -l hotspot.db
 * 2. Fix ownership: sudo chown -R [USER]:[USER] /path/to/project
 * 3. Fix permissions: sudo chmod -R 775 /path/to/project
 * 4. See PERMISSIONS_WARNING.md for detailed instructions
 * 
 * Without proper permissions, settings will be lost and Mikrotik connections will fail.
 */

// Create database connection with error handling
let db;
try {
  db = new Database(dbPath, {
    timeout: 5000,
    verbose: process.env.NODE_ENV === 'development' ? console.log : null
  });
  
  // CRITICAL: Set journal mode to DELETE to avoid WAL file permission issues
  // WAL mode requires additional files (hotspot.db-wal, hotspot.db-shm) which can cause permission errors
  try {
    const journalMode = db.prepare('PRAGMA journal_mode').get();
    if (journalMode && journalMode.journal_mode && journalMode.journal_mode.toUpperCase() === 'WAL') {
      console.log('[Settings] Switching from WAL to DELETE journal mode to prevent permission issues');
      db.exec('PRAGMA journal_mode=DELETE');
    }
  } catch (pragmaError) {
    console.warn('[Settings] Could not set journal mode:', pragmaError.message);
  }
} catch (error) {
  console.error('[Settings] Failed to initialize database connection:', error.message);
  throw error;
}

/**
 * Helper function to sleep/delay (for retry backoff)
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class Settings {
  /**
   * Get settings with retry logic for transient I/O errors
   * @param {number} retries - Number of retry attempts (default: 3)
   * @returns {Object} Settings object
   */
  static get(retries = 3) {
    let lastError = null;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // Ensure database connection is still valid
        if (!db || !db.open) {
          throw new Error('Database connection is closed');
        }
        
        const result = db.prepare('SELECT * FROM settings WHERE id = 1').get();

        const columns = db.prepare('PRAGMA table_info(settings)').all();
        const columnNames = columns.map((col) => col.name);
        const hasSchoolName = columnNames.includes('school_name');

        if (!result) {
          return {
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

        const hasTelegram = columnNames.includes('telegram_bot_token') && columnNames.includes('telegram_chat_id');

        if (columnNames.includes('router_password_encrypted')) {
          return {
            router_ip: result.router_ip || '192.168.88.1',
            router_port: result.router_port || 8728,
            router_user: result.router_user || 'admin',
            router_password_encrypted: result.router_password_encrypted || '',
            hotspot_dns_name: result.hotspot_dns_name || '',
            telegram_bot_token: hasTelegram ? (result.telegram_bot_token || '') : '',
            telegram_chat_id: hasTelegram ? (result.telegram_chat_id || '') : '',
            school_name: hasSchoolName ? (result.school_name || 'SMAN 1 CONTOH') : 'SMAN 1 CONTOH'
          };
        } else {
          return {
            router_ip: result.router_ip || '192.168.88.1',
            router_port: result.router_port || 8728,
            router_user: result.router_user || 'admin',
            router_password: result.router_password || 'admin',
            hotspot_dns_name: result.hotspot_dns_name || '',
            telegram_bot_token: hasTelegram ? (result.telegram_bot_token || '') : '',
            telegram_chat_id: hasTelegram ? (result.telegram_chat_id || '') : '',
            school_name: hasSchoolName ? (result.school_name || 'SMAN 1 CONTOH') : 'SMAN 1 CONTOH'
          };
        }
      } catch (error) {
        lastError = error;
        
        // CRITICAL: Enhanced diagnostic logging for SQLITE_IOERR
        if (error.code && (error.code.includes('SQLITE_IOERR') || error.code.includes('IOERR'))) {
          if (attempt === 0) {
            // Only log full details on first attempt
            console.error('='.repeat(60));
            console.error('⚠️  CRITICAL: SQLITE I/O ERROR DETECTED');
            console.error('='.repeat(60));
            console.error('Full error details:');
            console.error('  Message:', error.message);
            console.error('  Code:', error.code);
            console.error('  Database path:', dbPath);
            console.error('  Attempt:', attempt + 1, 'of', retries + 1);
            console.error('');
            console.error('ROOT CAUSE: File system permissions or concurrent access issue');
            console.error('');
            console.error('IMMEDIATE ACTION REQUIRED:');
            console.error('  1. Check file ownership: ls -l', dbPath);
            console.error('  2. Fix ownership: sudo chown -R $(whoami):$(whoami) /path/to/project');
            console.error('  3. Fix permissions: sudo chmod -R 775 /path/to/project');
            console.error('  4. Remove journal files: rm -f hotspot.db-journal hotspot.db-wal hotspot.db-shm');
            console.error('  5. Set journal mode: sqlite3 hotspot.db "PRAGMA journal_mode=DELETE;"');
            console.error('  6. See PERMISSIONS_WARNING.md for detailed instructions');
            console.error('='.repeat(60));
          } else {
            console.error(`[Settings.get] SQLITE I/O ERROR (Attempt ${attempt + 1}/${retries + 1}):`, error.message);
          }
          
          // Retry with exponential backoff for I/O errors
          if (attempt < retries) {
            const delay = Math.min(100 * Math.pow(2, attempt), 1000); // Max 1 second
            console.log(`[Settings.get] Retrying in ${delay}ms...`);
            // Use synchronous sleep for better-sqlite3 (which is synchronous)
            const start = Date.now();
            while (Date.now() - start < delay) {
              // Busy wait (better-sqlite3 is synchronous, so we can't use async/await)
            }
            continue;
          }
        } else {
          // Non-I/O errors: log and break immediately
          console.error('[Settings.get] Database error:', error.message);
          console.error('[Settings.get] Error code:', error.code);
          break;
        }
      }
    }
    
    // All retries failed - return default settings to prevent app crash
    console.error('[Settings.get] All retry attempts failed, returning default settings');
    return {
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

  /**
   * Update settings with retry logic for transient I/O errors
   * @param {Object} data - Settings data to update
   * @param {number} retries - Number of retry attempts (default: 3)
   * @returns {Object} Update result
   */
  static update(data, retries = 3) {
    let lastError = null;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // Ensure database connection is still valid
        if (!db || !db.open) {
          throw new Error('Database connection is closed');
        }
        
        const existing = db.prepare('SELECT id FROM settings WHERE id = 1').get();
        const columns = db.prepare('PRAGMA table_info(settings)').all();
        const columnNames = columns.map((col) => col.name);

        const fields = [];
        const values = [];

        fields.push('router_ip = ?');
        values.push(data.router_ip);

        fields.push('router_port = ?');
        values.push(data.router_port);

        fields.push('router_user = ?');
        values.push(data.router_user);

        if (columnNames.includes('router_password_encrypted')) {
          fields.push('router_password_encrypted = ?');
          values.push(data.router_password_encrypted || '');
        } else if (columnNames.includes('router_password')) {
          fields.push('router_password = ?');
          values.push(data.router_password || 'admin');
        }

        if (columnNames.includes('hotspot_dns_name')) {
          fields.push('hotspot_dns_name = ?');
          values.push(data.hotspot_dns_name || '');
        } else {
          console.warn('[Settings.update] Column hotspot_dns_name does not exist in settings table');
        }

        if (columnNames.includes('telegram_bot_token')) {
          fields.push('telegram_bot_token = ?');
          values.push(data.telegram_bot_token || '');
        } else {
          console.warn('[Settings.update] Column telegram_bot_token does not exist in settings table. Run setup_db.js to add it.');
        }

        if (columnNames.includes('telegram_chat_id')) {
          fields.push('telegram_chat_id = ?');
          values.push(data.telegram_chat_id || '');
        } else {
          console.warn('[Settings.update] Column telegram_chat_id does not exist in settings table. Run setup_db.js to add it.');
        }

        if (columnNames.includes('school_name')) {
          fields.push('school_name = ?');
          values.push(data.school_name || 'SMAN 1 CONTOH');
        } else {
          console.warn('[Settings.update] Column school_name does not exist in settings table. Run setup_db.js to add it.');
        }

        if (existing) {
          const updateQuery = `UPDATE settings SET ${fields.join(', ')} WHERE id = 1`;
          const stmt = db.prepare(updateQuery);
          const result = stmt.run(...values);
          console.log('[Settings] Updated successfully');
          return result;
        } else {
          const insertFields = ['id', ...fields.map(f => f.split(' = ')[0])];
          const insertPlaceholders = '?, ' + fields.map(() => '?').join(', ');
          const insertValues = [1, ...values];
          const stmt = db.prepare(`INSERT INTO settings (${insertFields.join(', ')}) VALUES (${insertPlaceholders})`);
          const result = stmt.run(...insertValues);
          console.log('[Settings] Inserted successfully');
          return result;
        }
      } catch (error) {
        lastError = error;
        
        // CRITICAL: Enhanced diagnostic logging for SQLITE_IOERR
        if (error.code && (error.code.includes('SQLITE_IOERR') || error.code.includes('IOERR'))) {
          if (attempt === 0) {
            console.error('='.repeat(60));
            console.error('⚠️  CRITICAL: SQLITE I/O ERROR DETECTED (UPDATE)');
            console.error('='.repeat(60));
            console.error('Full error details:');
            console.error('  Message:', error.message);
            console.error('  Code:', error.code);
            console.error('  Database path:', dbPath);
            console.error('  Attempt:', attempt + 1, 'of', retries + 1);
            console.error('='.repeat(60));
          } else {
            console.error(`[Settings.update] SQLITE I/O ERROR (Attempt ${attempt + 1}/${retries + 1}):`, error.message);
          }
          
          // Retry with exponential backoff for I/O errors
          if (attempt < retries) {
            const delay = Math.min(100 * Math.pow(2, attempt), 1000); // Max 1 second
            console.log(`[Settings.update] Retrying in ${delay}ms...`);
            // Use synchronous sleep for better-sqlite3 (which is synchronous)
            const start = Date.now();
            while (Date.now() - start < delay) {
              // Busy wait
            }
            continue;
          }
        } else {
          // Non-I/O errors: log and break immediately
          console.error('[Settings.update] Database error:', error.message);
          console.error('[Settings.update] Error code:', error.code);
          break;
        }
      }
    }
    
    // All retries failed - throw error
    console.error('[Settings.update] All retry attempts failed');
    throw lastError || new Error('Failed to update settings after retries');
  }
}

module.exports = Settings;

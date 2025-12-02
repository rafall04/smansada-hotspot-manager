const { getDatabase, checkpoint } = require('./db');
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
 * 4. See CODING_STANDARDS.md section "Environmental & Persistence Resilience" for detailed instructions
 * 
 * Without proper permissions, settings will be lost and Mikrotik connections will fail.
 * 
 * ⚠️ CRITICAL: Database Connection
 * =================================
 * This module now uses the SHARED database connection from models/db.js
 * This ensures data consistency and proper commit behavior across all models.
 */

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
   * Get settings with simplified retry logic (non-blocking)
   * Returns empty object on persistent failure to allow graceful degradation
   * @param {number} retries - Number of retry attempts (default: 1, minimal retry)
   * @returns {Object} Settings object or empty object on failure
   */
  static get(retries = 1) {
    let lastError = null;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const db = getDatabase();
        
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
          // Always log full details for I/O errors
          console.error('='.repeat(60));
          console.error('⚠️  CRITICAL: SQLITE I/O ERROR DETECTED (Settings.get)');
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
          console.error('  1. Move project out of /root to user-accessible path:');
          console.error('     sudo mv /root/smansada-hotspot-manager /home/$(whoami)/hotspot-manager');
          console.error('  2. Fix ownership: sudo chown -R $(whoami):$(whoami) /home/$(whoami)/hotspot-manager');
          console.error('  3. Fix permissions: sudo chmod -R 775 /home/$(whoami)/hotspot-manager');
          console.error('  4. Remove journal files: rm -f hotspot.db-journal hotspot.db-wal hotspot.db-shm');
          console.error('  5. Set journal mode: sqlite3 hotspot.db "PRAGMA journal_mode=DELETE;"');
          console.error('  6. Update PM2: pm2 delete smansada-hotspot && cd /home/$(whoami)/hotspot-manager && pm2 start ecosystem.config.js');
          console.error('  7. See CODING_STANDARDS.md section "Environmental & Persistence Resilience" for detailed instructions');
          console.error('='.repeat(60));
          
          // Single retry with minimal delay (100ms) to avoid blocking
          if (attempt < retries) {
            const delay = 100;
            console.log(`[Settings.get] Retrying once in ${delay}ms...`);
            const start = Date.now();
            while (Date.now() - start < delay) {
              // Busy wait
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
    
    // All retries failed - return empty object to signal critical failure
    // This allows the app to render with "Disconnected" status instead of crashing
    console.error('[Settings.get] ⚠️  CRITICAL: All retry attempts failed. Returning empty settings object.');
    console.error('[Settings.get] Database I/O Failed - Application will continue with default/empty settings');
    
    // Return empty object to signal failure (caller should handle gracefully)
    return {};
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
        const db = getDatabase();
        
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
          
          // CRITICAL: Force checkpoint to ensure data is written to disk
          // This prevents data loss if the application crashes or is restarted
          checkpoint();
          
          console.log('[Settings] Updated successfully (data flushed to disk)');
          return result;
        } else {
          const insertFields = ['id', ...fields.map(f => f.split(' = ')[0])];
          const insertPlaceholders = '?, ' + fields.map(() => '?').join(', ');
          const insertValues = [1, ...values];
          const stmt = db.prepare(`INSERT INTO settings (${insertFields.join(', ')}) VALUES (${insertPlaceholders})`);
          const result = stmt.run(...insertValues);
          
          // CRITICAL: Force checkpoint to ensure data is written to disk
          checkpoint();
          
          console.log('[Settings] Inserted successfully (data flushed to disk)');
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

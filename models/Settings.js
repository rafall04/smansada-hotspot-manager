const { getDatabase, checkpoint } = require('./db');
const path = require('path');
const routerConfigStorage = require('../utils/routerConfigStorage');

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

        const routerConfigData = routerConfigStorage.getRouterConfig();
        const hasTelegram = columnNames.includes('telegram_bot_token') && columnNames.includes('telegram_chat_id');

        if (!result) {
          return {
            ...routerConfigData,
            hotspot_dns_name: '',
            telegram_bot_token: '',
            telegram_chat_id: '',
            school_name: 'SMAN 1 CONTOH'
          };
        }

        return {
          ...routerConfigData, // router_ip, router_port, router_user, router_password_encrypted from environment variables ONLY
          hotspot_dns_name: result.hotspot_dns_name || '',
          telegram_bot_token: hasTelegram ? (result.telegram_bot_token || '') : '',
          telegram_chat_id: hasTelegram ? (result.telegram_chat_id || '') : '',
          school_name: hasSchoolName ? (result.school_name || 'SMAN 1 CONTOH') : 'SMAN 1 CONTOH'
        };
      } catch (error) {
        lastError = error;
        
        if (error.code && (error.code.includes('SQLITE_IOERR') || error.code.includes('IOERR'))) {
          if (attempt === 0) {
            console.error('[Settings.get] ⚠️  SQLITE I/O ERROR:', error.code);
            console.error('[Settings.get] Database path:', dbPath);
            console.error('[Settings.get] Message:', error.message);
            
            if (dbPath.includes('/root/') || dbPath.includes('/home/root/')) {
              console.error('[Settings.get] ⚠️  Project is in /root directory - this can cause permission issues');
              console.error('[Settings.get] 💡 Move project to user directory: sudo mv /home/root/smansada-hotspot-manager /home/$(whoami)/');
              console.error('[Settings.get] 💡 Fix ownership: sudo chown -R $(whoami):$(whoami) /home/$(whoami)/smansada-hotspot-manager');
            }
            
            if (attempt < retries) {
              console.log('[Settings.get] Retrying...');
            }
          }
          
          if (attempt < retries) {
            const delay = 100;
            const start = Date.now();
            while (Date.now() - start < delay) {
              // Busy wait
            }
            continue;
          }
        } else {
          if (attempt === 0) {
            console.error('[Settings.get] Database error:', error.message);
            console.error('[Settings.get] Error code:', error.code);
          }
          break;
        }
      }
    }
    
    if (lastError && lastError.code && (lastError.code.includes('SQLITE_IOERR') || lastError.code.includes('IOERR'))) {
      console.warn('[Settings.get] ⚠️  Database I/O error - using default settings (application will continue)');
    } else if (lastError) {
      console.warn('[Settings.get] ⚠️  Database error - using default settings:', lastError.message);
    }
    
    const routerConfigData = routerConfigStorage.getRouterConfig();
    return {
      ...routerConfigData,
      hotspot_dns_name: '',
      telegram_bot_token: '',
      telegram_chat_id: '',
      school_name: 'SMAN 1 CONTOH',
      _io_error: true
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
        const db = getDatabase();
        
        const existing = db.prepare('SELECT id FROM settings WHERE id = 1').get();
        const columns = db.prepare('PRAGMA table_info(settings)').all();
        const columnNames = columns.map((col) => col.name);

        // Router configuration is now ONLY stored in environment variables
        if (data.router_ip || data.router_port || data.router_user || data.router_password || data.router_password_encrypted) {
          console.warn('[Settings] ⚠️  Router configuration cannot be saved via Settings.update()');
          console.warn('[Settings] 💡 Router config must be set in .env file (ROUTER_IP, ROUTER_USER, ROUTER_PASSWORD_ENCRYPTED)');
          console.warn('[Settings] 💡 Update .env file and restart application to change router configuration');
        }

        const fields = [];
        const values = [];

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
          if (fields.length > 0) {
            const updateQuery = `UPDATE settings SET ${fields.join(', ')} WHERE id = 1`;
            const stmt = db.prepare(updateQuery);
            const result = stmt.run(...values);
            
            const checkpointSuccess = checkpoint();
            if (!checkpointSuccess) {
              console.error('[Settings] ⚠️  WARNING: Checkpoint failed, data may not be persisted!');
            }
            
            return result;
          } else {
            return { changes: 0 };
          }
        } else {
          if (fields.length > 0) {
            const insertFields = ['id', ...fields.map(f => f.split(' = ')[0])];
            const insertPlaceholders = '?, ' + fields.map(() => '?').join(', ');
            const insertValues = [1, ...values];
            const stmt = db.prepare(`INSERT INTO settings (${insertFields.join(', ')}) VALUES (${insertPlaceholders})`);
            const result = stmt.run(...insertValues);
            
            const checkpointSuccess = checkpoint();
            if (!checkpointSuccess) {
              console.error('[Settings] ⚠️  WARNING: Checkpoint failed, data may not be persisted!');
            }
            
            return result;
          } else {
            return { changes: 0 };
          }
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
          
          if (attempt < retries) {
            const delay = Math.min(100 * Math.pow(2, attempt), 1000);
            const start = Date.now();
            while (Date.now() - start < delay) {
              // Busy wait
            }
            continue;
          }
        } else {
          console.error('[Settings.update] Database error:', error.message);
          console.error('[Settings.update] Error code:', error.code);
          break;
        }
      }
    }
    
    console.error('[Settings.update] All retry attempts failed');
    throw lastError || new Error('Failed to update settings after retries');
  }
}

module.exports = Settings;

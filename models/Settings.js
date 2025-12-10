const { getDatabase, checkpoint } = require('./db');
const path = require('path');
const routerConfig = require('../utils/routerConfig');

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

        const routerConfigData = routerConfig.getRouterConfig();
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
          ...routerConfigData, // router_ip, router_port, router_user, router_password_encrypted from JSON
          hotspot_dns_name: result.hotspot_dns_name || '',
          telegram_bot_token: hasTelegram ? (result.telegram_bot_token || '') : '',
          telegram_chat_id: hasTelegram ? (result.telegram_chat_id || '') : '',
          school_name: hasSchoolName ? (result.school_name || 'SMAN 1 CONTOH') : 'SMAN 1 CONTOH'
        };
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
          console.error('[Settings.get] Database error:', error.message);
          console.error('[Settings.get] Error code:', error.code);
          break;
        }
      }
    }
    
    console.error('[Settings.get] ⚠️  CRITICAL: All retry attempts failed. Returning empty settings object.');
    console.error('[Settings.get] Database I/O Failed - Application will continue with default/empty settings');
    
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

        if (data.router_ip || data.router_port || data.router_user || data.router_password || data.router_password_encrypted) {
          const routerUpdateData = {
            router_ip: data.router_ip,
            router_port: data.router_port,
            router_user: data.router_user,
            router_password: data.router_password,
            router_password_encrypted: data.router_password_encrypted
          };
          
          const routerUpdateSuccess = routerConfig.updateRouterConfig(routerUpdateData);
          if (!routerUpdateSuccess) {
            throw new Error('Failed to save router configuration to JSON file');
          }
          console.log('[Settings] Router configuration saved to JSON file');
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
            
            console.log('[Settings] Other settings updated successfully (data flushed to disk)');
            return result;
          } else {
            console.log('[Settings] Only router config updated (JSON file), no database changes');
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
            
            console.log('[Settings] Settings inserted successfully (data flushed to disk)');
            return result;
          } else {
            console.log('[Settings] Only router config saved (JSON file), no database insert needed');
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
            console.log(`[Settings.update] Retrying in ${delay}ms...`);
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

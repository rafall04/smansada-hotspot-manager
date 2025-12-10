const fs = require('fs');
const path = require('path');
const cryptoHelper = require('./cryptoHelper');

const projectRoot = path.resolve(__dirname, '..');
const configPath = path.join(projectRoot, 'router-config.json');
const { getDatabase } = require('../models/db');

/**
 * Router Configuration Storage - Multi-Layer Approach
 * 
 * Uses multiple storage layers with fallback mechanism:
 * 1. Environment Variables (most reliable, survives reboot)
 * 2. JSON File (fast, easy to debug)
 * 3. Database (fallback, for migration)
 * 
 * This ensures router config is never lost even if one storage method fails.
 */

const DEFAULT_CONFIG = {
  router_ip: '192.168.88.1',
  router_port: 8728,
  router_user: 'admin',
  router_password_encrypted: ''
};

/**
 * Read router config from environment variables
 * Supports both new format (ROUTER_*) and legacy format (MIKROTIK_*)
 * @returns {Object|null} Config object or null if not set
 */
function getFromEnv() {
  // Try new format first (ROUTER_*)
  let routerIp = process.env.ROUTER_IP;
  let routerPort = process.env.ROUTER_PORT;
  let routerUser = process.env.ROUTER_USER;
  let routerPasswordEncrypted = process.env.ROUTER_PASSWORD_ENCRYPTED;

  // Fallback to legacy format (MIKROTIK_*)
  if (!routerIp) routerIp = process.env.MIKROTIK_HOST;
  if (!routerPort) routerPort = process.env.MIKROTIK_PORT;
  if (!routerUser) routerUser = process.env.MIKROTIK_USER;
  if (!routerPasswordEncrypted) {
    // Legacy format might have plain password, need to encrypt it
    const legacyPassword = process.env.MIKROTIK_PASSWORD;
    if (legacyPassword) {
      console.warn('[RouterConfigStorage] ⚠️  MIKROTIK_PASSWORD found (plain text). Please use ROUTER_PASSWORD_ENCRYPTED with encrypted value.');
      console.warn('[RouterConfigStorage] 💡 Run: node scripts/setup-router-env.js your_password');
      // Encrypt on-the-fly for backward compatibility
      routerPasswordEncrypted = cryptoHelper.encrypt(legacyPassword);
    }
  }

  if (routerIp && routerUser && routerPasswordEncrypted) {
    // Warn if using legacy format
    if (process.env.MIKROTIK_HOST || process.env.MIKROTIK_USER || process.env.MIKROTIK_PASSWORD) {
      console.warn('[RouterConfigStorage] ⚠️  Using legacy environment variable names (MIKROTIK_*).');
      console.warn('[RouterConfigStorage] 💡 Please migrate to new format: ROUTER_IP, ROUTER_USER, ROUTER_PASSWORD_ENCRYPTED');
    }

    return {
      router_ip: routerIp,
      router_port: parseInt(routerPort) || 8728,
      router_user: routerUser,
      router_password_encrypted: routerPasswordEncrypted
    };
  }

  return null;
}

/**
 * Read router config from JSON file
 * @returns {Object|null} Config object or null if error
 */
function getFromFile() {
  try {
    if (!fs.existsSync(configPath)) {
      return null;
    }

    const fileContent = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(fileContent);

    if (config.router_ip && config.router_user && config.router_password_encrypted) {
      return {
        router_ip: config.router_ip || DEFAULT_CONFIG.router_ip,
        router_port: config.router_port || DEFAULT_CONFIG.router_port,
        router_user: config.router_user || DEFAULT_CONFIG.router_user,
        router_password_encrypted: config.router_password_encrypted || DEFAULT_CONFIG.router_password_encrypted
      };
    }

    return null;
  } catch (error) {
    console.warn('[RouterConfigStorage] Error reading from file:', error.message);
    return null;
  }
}

/**
 * Read router config from database (legacy/migration)
 * @returns {Object|null} Config object or null if error
 */
function getFromDatabase() {
  try {
    const db = getDatabase();
    const result = db.prepare('SELECT router_ip, router_port, router_user, router_password_encrypted FROM settings WHERE id = 1').get();

    if (result && result.router_ip && result.router_user && result.router_password_encrypted) {
      return {
        router_ip: result.router_ip,
        router_port: result.router_port || 8728,
        router_user: result.router_user,
        router_password_encrypted: result.router_password_encrypted
      };
    }

    return null;
  } catch (error) {
    console.warn('[RouterConfigStorage] Error reading from database:', error.message);
    return null;
  }
}

/**
 * Get router configuration with multi-layer fallback
 * Priority: Environment Variables (PRIMARY) > JSON File > Database > Defaults
 * 
 * Environment Variables are the PRIMARY storage method because:
 * - They survive reboots (if set in systemd/PM2)
 * - Not affected by file system issues
 * - Not affected by permission issues
 * - Most reliable for production
 * 
 * @returns {Object} Router configuration object
 */
function getRouterConfig() {
  const envConfig = getFromEnv();
  if (envConfig) {
    console.log('[RouterConfigStorage] ✓ Loaded from environment variables (PRIMARY)');
    try {
      saveToFile(envConfig);
    } catch (e) {
      // Ignore backup errors
    }
    return envConfig;
  }

  const fileConfig = getFromFile();
  if (fileConfig) {
    console.log('[RouterConfigStorage] ⚠️  Loaded from JSON file (fallback - consider using environment variables)');
    return fileConfig;
  }

  const dbConfig = getFromDatabase();
  if (dbConfig) {
    console.log('[RouterConfigStorage] ⚠️  Loaded from database (migrating to file...)');
    saveToFile(dbConfig);
    return dbConfig;
  }

  console.warn('[RouterConfigStorage] ⚠️  No config found, using defaults');
  console.warn('[RouterConfigStorage] 💡 TIP: Set ROUTER_IP, ROUTER_USER, ROUTER_PASSWORD_ENCRYPTED in .env for maximum reliability');
  return { ...DEFAULT_CONFIG };
}

/**
 * Save router config to JSON file with atomic write and fsync
 * This is used as backup when environment variables are primary
 * @param {Object} config - Configuration object
 * @returns {boolean} Success status
 */
function saveToFile(config) {
  try {
    if (!config.router_ip || !config.router_user || !config.router_password_encrypted) {
      throw new Error('router_ip, router_user, and router_password_encrypted are required');
    }

    const configToSave = {
      router_ip: String(config.router_ip).trim(),
      router_port: parseInt(config.router_port) || 8728,
      router_user: String(config.router_user).trim(),
      router_password_encrypted: String(config.router_password_encrypted).trim()
    };

    if (configToSave.router_port < 1 || configToSave.router_port > 65535) {
      throw new Error('router_port must be between 1 and 65535');
    }

    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    const tempPath = configPath + '.tmp';
    const jsonContent = JSON.stringify(configToSave, null, 2);
    fs.writeFileSync(tempPath, jsonContent, 'utf8');

    const fd = fs.openSync(tempPath, 'r+');
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }

    fs.renameSync(tempPath, configPath);

    const finalFd = fs.openSync(configPath, 'r+');
    try {
      fs.fsyncSync(finalFd);
    } finally {
      fs.closeSync(finalFd);
    }

    return true;
  } catch (error) {
    console.error('[RouterConfigStorage] ❌ Error saving to file:', error.message);
    return false;
  }
}

/**
 * Save router config to database (for backup/migration)
 * @param {Object} config - Configuration object
 * @returns {boolean} Success status
 */
function saveToDatabase(config) {
  try {
    const db = getDatabase();
    const columns = db.prepare('PRAGMA table_info(settings)').all();
    const columnNames = columns.map((col) => col.name);

    if (!columnNames.includes('router_password_encrypted')) {
      console.warn('[RouterConfigStorage] router_password_encrypted column does not exist in database');
      return false;
    }

    const existing = db.prepare('SELECT id FROM settings WHERE id = 1').get();
    
    if (existing) {
      db.prepare('UPDATE settings SET router_ip = ?, router_port = ?, router_user = ?, router_password_encrypted = ? WHERE id = 1')
        .run(config.router_ip, config.router_port, config.router_user, config.router_password_encrypted);
    } else {
      db.prepare('INSERT INTO settings (id, router_ip, router_port, router_user, router_password_encrypted) VALUES (1, ?, ?, ?, ?)')
        .run(config.router_ip, config.router_port, config.router_user, config.router_password_encrypted);
    }

    console.log('[RouterConfigStorage] ✓ Saved to database (backup)');
    return true;
  } catch (error) {
    console.error('[RouterConfigStorage] ❌ Error saving to database:', error.message);
    return false;
  }
}

/**
 * Save router config to multiple storage locations
 * 
 * NOTE: If environment variables are set, they take precedence and cannot be updated via this function.
 * Environment variables must be updated manually in .env file or system configuration.
 * 
 * This function saves to file and database as backup only.
 * 
 * @param {Object} config - Configuration object
 * @returns {boolean} Success status (true if at least one save succeeded)
 */
function saveRouterConfig(config) {
  const envConfig = getFromEnv();
  if (envConfig) {
    console.log('[RouterConfigStorage] ⚠️  Environment variables are set - they take precedence');
    console.log('[RouterConfigStorage] 💡 To update router config, modify .env file or environment variables and restart application');
    console.log('[RouterConfigStorage] 💡 Saving to file and database as backup only...');
  }

  let fileSuccess = false;
  let dbSuccess = false;

  fileSuccess = saveToFile(config);
  dbSuccess = saveToDatabase(config);

  if (!fileSuccess && !dbSuccess) {
    console.error('[RouterConfigStorage] ❌ CRITICAL: Failed to save to both file and database!');
    return false;
  }

  if (fileSuccess && dbSuccess) {
    console.log('[RouterConfigStorage] ✓ Saved to both file and database (backup)');
  } else if (fileSuccess) {
    console.warn('[RouterConfigStorage] ⚠️  Saved to file only (database save failed)');
  } else {
    console.warn('[RouterConfigStorage] ⚠️  Saved to database only (file save failed)');
  }

  return true;
}

/**
 * Update router configuration
 * 
 * IMPORTANT: If environment variables are set, they take precedence.
 * This function will save to file and database as backup, but environment variables
 * will still be used for reading. To actually update the config, modify .env file.
 * 
 * @param {Object} data - Configuration data
 * @returns {boolean} Success status
 */
function updateRouterConfig(data) {
  try {
    const envConfig = getFromEnv();
    const currentConfig = getRouterConfig();

    const updatedConfig = {
      router_ip: data.router_ip || currentConfig.router_ip,
      router_port: data.router_port || currentConfig.router_port,
      router_user: data.router_user || currentConfig.router_user,
      router_password_encrypted: currentConfig.router_password_encrypted
    };

    if (data.router_password && data.router_password.trim() !== '') {
      try {
        updatedConfig.router_password_encrypted = cryptoHelper.encrypt(data.router_password);
      } catch (encryptError) {
        console.error('[RouterConfigStorage] Encryption error:', encryptError.message);
        throw new Error('Failed to encrypt password');
      }
    } else if (data.router_password_encrypted) {
      updatedConfig.router_password_encrypted = data.router_password_encrypted;
    }

    if (!updatedConfig.router_password_encrypted || updatedConfig.router_password_encrypted.trim() === '') {
      throw new Error('Router password is required');
    }

    if (envConfig) {
      console.warn('[RouterConfigStorage] ⚠️  WARNING: Environment variables are set and will take precedence!');
      console.warn('[RouterConfigStorage] 💡 Saving to file/database as backup, but env vars will be used for reading.');
      console.warn('[RouterConfigStorage] 💡 To update router config, modify .env file and restart application.');
    }

    const success = saveRouterConfig(updatedConfig);

    if (success) {
      if (envConfig) {
        const verifyEnv = getFromEnv();
        if (verifyEnv && verifyEnv.router_password_encrypted !== updatedConfig.router_password_encrypted) {
          console.warn('[RouterConfigStorage] ⚠️  Environment variable password differs from saved value');
          console.warn('[RouterConfigStorage] 💡 Environment variable will be used (update .env to change)');
        }
      } else {
        const verifyConfig = getRouterConfig();
        if (verifyConfig.router_password_encrypted !== updatedConfig.router_password_encrypted) {
          console.error('[RouterConfigStorage] ❌ CRITICAL: Password verification failed!');
          throw new Error('Password verification failed - data may not be persisted correctly');
        }
        console.log('[RouterConfigStorage] ✓ Password verification passed');
      }
    }

    return success;
  } catch (error) {
    console.error('[RouterConfigStorage] Update error:', error.message);
    return false;
  }
}

/**
 * Get decrypted router password
 * @returns {string} Decrypted password or 'admin' as default
 */
function getDecryptedPassword() {
  try {
    const config = getRouterConfig();
    if (config.router_password_encrypted && config.router_password_encrypted.trim() !== '') {
      return cryptoHelper.decrypt(config.router_password_encrypted);
    }
    return 'admin';
  } catch (error) {
    console.error('[RouterConfigStorage] Decryption error:', error.message);
    return 'admin';
  }
}

module.exports = {
  getRouterConfig,
  saveRouterConfig,
  updateRouterConfig,
  getDecryptedPassword,
  configPath,
  getFromEnv,
  getFromFile,
  getFromDatabase
};


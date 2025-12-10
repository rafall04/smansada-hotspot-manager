const fs = require('fs');
const path = require('path');
const cryptoHelper = require('./cryptoHelper');

const projectRoot = path.resolve(__dirname, '..');
const configPath = path.join(projectRoot, 'router-config.json');

/**
 * Router Configuration Manager
 * 
 * Stores router configuration (IP, username, password) in JSON file
 * instead of database to prevent data loss on reboot.
 * 
 * This is more reliable than SQLite for critical configuration data.
 */

const DEFAULT_CONFIG = {
  router_ip: '192.168.88.1',
  router_port: 8728,
  router_user: 'admin',
  router_password_encrypted: ''
};

/**
 * Read router configuration from JSON file
 * 
 * ⚠️ IMPORTANT: This function reads from file EVERY TIME it's called (no caching).
 * This ensures that router config changes are immediately available without restart.
 * 
 * Auto-reload behavior:
 * - Settings.get() is called on every HTTP request (via middleware)
 * - Settings.get() calls this function every time
 * - So router config is automatically reloaded on every request
 * 
 * @returns {Object} Router configuration object
 */
function getRouterConfig() {
  try {
    if (!fs.existsSync(configPath)) {
      console.log('[RouterConfig] Config file does not exist, creating with defaults...');
      saveRouterConfig(DEFAULT_CONFIG);
      return { ...DEFAULT_CONFIG };
    }

    const fileContent = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(fileContent);

    return {
      router_ip: config.router_ip || DEFAULT_CONFIG.router_ip,
      router_port: config.router_port || DEFAULT_CONFIG.router_port,
      router_user: config.router_user || DEFAULT_CONFIG.router_user,
      router_password_encrypted: config.router_password_encrypted || DEFAULT_CONFIG.router_password_encrypted
    };
  } catch (error) {
    console.error('[RouterConfig] Error reading config file:', error.message);
    console.error('[RouterConfig] Using default configuration');
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Save router configuration to JSON file with atomic write and fsync
 * @param {Object} config - Configuration object
 * @returns {boolean} Success status
 */
function saveRouterConfig(config) {
  try {
    if (!config.router_ip || !config.router_user) {
      throw new Error('router_ip and router_user are required');
    }

    const configToSave = {
      router_ip: String(config.router_ip).trim(),
      router_port: parseInt(config.router_port) || 8728,
      router_user: String(config.router_user).trim(),
      router_password_encrypted: String(config.router_password_encrypted || '').trim()
    };

    if (configToSave.router_port < 1 || configToSave.router_port > 65535) {
      throw new Error('router_port must be between 1 and 65535');
    }

    if (fs.existsSync(configPath)) {
      const backupPath = configPath + '.backup';
      try {
        fs.copyFileSync(configPath, backupPath);
      } catch (backupError) {
        console.warn('[RouterConfig] Could not create backup:', backupError.message);
      }
    }

    const tempPath = configPath + '.tmp';
    const jsonContent = JSON.stringify(configToSave, null, 2);
    fs.writeFileSync(tempPath, jsonContent, 'utf8');

    const fd = fs.openSync(tempPath, 'r+');
    try {
      fs.fsyncSync(fd);
      console.log('[RouterConfig] ✓ Data flushed to disk');
    } finally {
      fs.closeSync(fd);
    }

    fs.renameSync(tempPath, configPath);

    const finalFd = fs.openSync(configPath, 'r+');
    try {
      fs.fsyncSync(finalFd);
      console.log('[RouterConfig] ✓ Final fsync completed - data guaranteed on disk');
    } finally {
      fs.closeSync(finalFd);
    }

    console.log('[RouterConfig] ✓ Configuration saved successfully');
    return true;
  } catch (error) {
    console.error('[RouterConfig] ❌ Error saving config:', error.message);
    console.error('[RouterConfig] Error code:', error.code);
    
    const tempPath = configPath + '.tmp';
    if (fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch (cleanupError) {
        console.warn('[RouterConfig] Could not clean up temp file:', cleanupError.message);
      }
    }
    
    return false;
  }
}

/**
 * Update router configuration
 * @param {Object} data - Configuration data (router_ip, router_port, router_user, router_password)
 * @returns {boolean} Success status
 */
function updateRouterConfig(data) {
  try {
    const currentConfig = getRouterConfig();
    const cryptoHelper = require('./cryptoHelper');

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
        console.error('[RouterConfig] Encryption error:', encryptError.message);
        throw new Error('Failed to encrypt password');
      }
    } else if (data.router_password_encrypted) {
      updatedConfig.router_password_encrypted = data.router_password_encrypted;
    }

    if (!updatedConfig.router_password_encrypted || updatedConfig.router_password_encrypted.trim() === '') {
      throw new Error('Router password is required');
    }

    const success = saveRouterConfig(updatedConfig);
    
    if (success) {
      const verifyConfig = getRouterConfig();
      if (verifyConfig.router_password_encrypted !== updatedConfig.router_password_encrypted) {
        console.error('[RouterConfig] ❌ CRITICAL: Password verification failed after write!');
        throw new Error('Password verification failed - data may not be persisted correctly');
      }
      console.log('[RouterConfig] ✓ Password verification passed - data confirmed on disk');
    }
    
    return success;
  } catch (error) {
    console.error('[RouterConfig] Update error:', error.message);
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
    console.error('[RouterConfig] Decryption error:', error.message);
    return 'admin';
  }
}

module.exports = {
  getRouterConfig,
  saveRouterConfig,
  updateRouterConfig,
  getDecryptedPassword,
  configPath
};


const cryptoHelper = require('./cryptoHelper');

/**
 * Router Configuration Storage - Environment Variables Only
 *
 * Router configuration (IP, username, password) is ONLY read from environment variables.
 * This ensures maximum reliability and prevents data loss after reboot.
 * 
 * Environment Variables Required:
 * - ROUTER_IP (or MIKROTIK_HOST for legacy)
 * - ROUTER_PORT (or MIKROTIK_PORT for legacy)
 * - ROUTER_USER (or MIKROTIK_USER for legacy)
 * - ROUTER_PASSWORD_ENCRYPTED (or MIKROTIK_PASSWORD for legacy - will be encrypted on-the-fly)
 */

const DEFAULT_CONFIG = {
  router_ip: '192.168.88.1',
  router_port: 8728,
  router_user: 'admin',
  router_password_encrypted: ''
};

function getFromEnv() {
  let routerIp = process.env.ROUTER_IP;
  let routerPort = process.env.ROUTER_PORT;
  let routerUser = process.env.ROUTER_USER;
  let routerPasswordEncrypted = process.env.ROUTER_PASSWORD_ENCRYPTED;

  if (!routerIp) {
    routerIp = process.env.MIKROTIK_HOST;
  }
  if (!routerPort) {
    routerPort = process.env.MIKROTIK_PORT;
  }
  if (!routerUser) {
    routerUser = process.env.MIKROTIK_USER;
  }
  if (!routerPasswordEncrypted) {
    const legacyPassword = process.env.MIKROTIK_PASSWORD;
    if (legacyPassword) {
      console.warn('[RouterConfigStorage] ⚠️  MIKROTIK_PASSWORD found (plain text). Please use ROUTER_PASSWORD_ENCRYPTED with encrypted value.');
      console.warn('[RouterConfigStorage] 💡 Run: node scripts/setup-router-env.js your_password');
      routerPasswordEncrypted = cryptoHelper.encrypt(legacyPassword);
    }
  }

  if (routerIp && routerUser && routerPasswordEncrypted) {
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

  console.warn('[RouterConfigStorage] ⚠️  Router configuration not found in environment variables');
  console.warn('[RouterConfigStorage] 💡 Set ROUTER_IP, ROUTER_USER, ROUTER_PASSWORD_ENCRYPTED in .env file');
  console.warn('[RouterConfigStorage] 💡 Using default configuration (may not work)');
  return { ...DEFAULT_CONFIG };
}

let configLoaded = false;

function getRouterConfig() {
  const envConfig = getFromEnv();

  if (!configLoaded) {
    console.log('[RouterConfigStorage] ✓ Router config loaded from environment variables (ONLY SOURCE)');
    configLoaded = true;
  }
  
  return envConfig;
}

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
  getDecryptedPassword,
  getFromEnv
};

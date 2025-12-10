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

/**
 * Read router config from environment variables ONLY
 * Supports both new format (ROUTER_*) and legacy format (MIKROTIK_*)
 * @returns {Object} Config object (returns defaults if env vars not set)
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

  // If env vars not set, return defaults with warning
  console.warn('[RouterConfigStorage] ⚠️  Router configuration not found in environment variables');
  console.warn('[RouterConfigStorage] 💡 Set ROUTER_IP, ROUTER_USER, ROUTER_PASSWORD_ENCRYPTED in .env file');
  console.warn('[RouterConfigStorage] 💡 Using default configuration (may not work)');
  return { ...DEFAULT_CONFIG };
}

/**
 * Get router configuration from environment variables ONLY
 * 
 * This is the ONLY source of router configuration.
 * No fallback to file or database - environment variables are required.
 * 
 * @returns {Object} Router configuration object
 */
function getRouterConfig() {
  const envConfig = getFromEnv();
  console.log('[RouterConfigStorage] ✓ Loaded from environment variables (ONLY SOURCE)');
  return envConfig;
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
  getDecryptedPassword,
  getFromEnv
};

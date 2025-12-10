const crypto = require('crypto');

/**
 * Crypto Helper untuk AES-256-CBC Encryption
 * Digunakan untuk encrypt password yang bisa dilihat admin (recovery)
 * dan encrypt router password
 *
 * Note: dotenv.config() harus dipanggil di app.js sebelum module ini di-load
 */

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const IV = process.env.IV || crypto.randomBytes(16).toString('hex');

if (!process.env.ENCRYPTION_KEY) {
  console.warn(
    '⚠️  WARNING: ENCRYPTION_KEY not set in .env. Using random key (not persistent across restarts).'
  );
  console.warn('⚠️  Please set ENCRYPTION_KEY in .env file (32 characters/bytes).');
}

if (!process.env.IV) {
  console.warn(
    '⚠️  WARNING: IV not set in .env. Using random IV (not persistent across restarts).'
  );
  console.warn('⚠️  Please set IV in .env file (16 characters/bytes).');
}

function encrypt(plaintext) {
  if (!plaintext) {
    return null;
  }

  try {
    const keyBuffer = Buffer.from(ENCRYPTION_KEY, 'hex');
    if (keyBuffer.length !== 32) {
      throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
    }

    const ivBuffer = Buffer.from(IV, 'hex');
    if (ivBuffer.length !== 16) {
      throw new Error('IV must be 32 hex characters (16 bytes)');
    }

    const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, ivBuffer);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return encrypted;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Gagal mengenkripsi data: ' + error.message);
  }
}

function decrypt(ciphertext) {
  if (!ciphertext) {
    return null;
  }

  const isHex = /^[0-9a-fA-F]+$/.test(ciphertext);
  if (!isHex || ciphertext.length < 32) {
    return ciphertext;
  }

  try {
    const keyBuffer = Buffer.from(ENCRYPTION_KEY, 'hex');
    if (keyBuffer.length !== 32) {
      throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
    }

    const ivBuffer = Buffer.from(IV, 'hex');
    if (ivBuffer.length !== 16) {
      throw new Error('IV must be 32 hex characters (16 bytes)');
    }

    const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, ivBuffer);
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    if (!decrypt._warnings) {
      decrypt._warnings = new Set();
    }
    if (!decrypt._warnings.has(ciphertext)) {
      console.warn('Decryption failed, assuming plain text (legacy data)');
      decrypt._warnings.add(ciphertext);
    }
    return ciphertext;
  }
}

function generateKey() {
  return crypto.randomBytes(32).toString('hex');
}

function generateIV() {
  return crypto.randomBytes(16).toString('hex');
}

module.exports = {
  encrypt,
  decrypt,
  generateKey,
  generateIV
};

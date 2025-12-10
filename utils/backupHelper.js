const fs = require('fs');
const path = require('path');
const { getDatabase } = require('../models/db');

function ensureBackupDirectory() {
  const backupDir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  return backupDir;
}

function generateBackupFilename() {
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/T/, '_')
    .replace(/:/g, '-')
    .replace(/\..+/, '')
    .replace(/-/g, '');
  return `hotspot_${timestamp}.db`;
}

function getFileSize(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.size;
  } catch (error) {
    return 0;
  }
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function verifyBackupIntegrity(backupPath) {
  try {
    const db = require('better-sqlite3')(backupPath, { readonly: true });
    const result = db.prepare('PRAGMA integrity_check').get();
    db.close();
    
    if (result && result.integrity_check === 'ok') {
      return true;
    }
    return false;
  } catch (error) {
    console.error('[BackupHelper] Integrity check error:', error.message);
    return false;
  }
}

function cleanupOldBackups(backupDir, keepCount = 10) {
  try {
    const files = fs.readdirSync(backupDir)
      .filter(file => file.startsWith('hotspot_') && file.endsWith('.db'))
      .map(file => ({
        name: file,
        path: path.join(backupDir, file),
        time: fs.statSync(path.join(backupDir, file)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);

    if (files.length > keepCount) {
      const filesToDelete = files.slice(keepCount);
      let deletedCount = 0;
      
      filesToDelete.forEach(file => {
        try {
          fs.unlinkSync(file.path);
          deletedCount++;
        } catch (error) {
          console.error(`[BackupHelper] Failed to delete old backup ${file.name}:`, error.message);
        }
      });
      
      if (deletedCount > 0) {
        console.log(`[BackupHelper] Cleaned up ${deletedCount} old backup(s)`);
      }
      
      return deletedCount;
    }
    
    return 0;
  } catch (error) {
    console.error('[BackupHelper] Cleanup error:', error.message);
    return 0;
  }
}

async function backupDatabase() {
  const dbPath = path.join(__dirname, '..', 'hotspot.db');
  
  if (!fs.existsSync(dbPath)) {
    throw new Error('Database file not found: ' + dbPath);
  }

  const backupDir = ensureBackupDirectory();
  const backupFilename = generateBackupFilename();
  const backupPath = path.join(backupDir, backupFilename);

  try {
    const db = getDatabase();
    
    db.pragma('synchronous = FULL');
    db.pragma('journal_mode = DELETE');
    
    await new Promise((resolve, reject) => {
      try {
        fs.copyFile(dbPath, backupPath, (err) => {
          if (err) {
            reject(new Error(`Failed to copy database file: ${err.message}`));
          } else {
            resolve();
          }
        });
      } catch (copyError) {
        reject(new Error(`Backup failed: ${copyError.message}`));
      }
    });

    if (!fs.existsSync(backupPath)) {
      throw new Error('Backup file was not created');
    }

    const isIntegrityOk = verifyBackupIntegrity(backupPath);
    if (!isIntegrityOk) {
      console.warn('[BackupHelper] ⚠️  Backup integrity check failed, but file was created');
    }

    const originalSize = getFileSize(dbPath);
    const backupSize = getFileSize(backupPath);
    
    cleanupOldBackups(backupDir, 10);

    return {
      success: true,
      backupPath: backupPath,
      backupFilename: backupFilename,
      originalSize: originalSize,
      backupSize: backupSize,
      originalSizeFormatted: formatFileSize(originalSize),
      backupSizeFormatted: formatFileSize(backupSize),
      integrityOk: isIntegrityOk,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    if (fs.existsSync(backupPath)) {
      try {
        fs.unlinkSync(backupPath);
      } catch (unlinkError) {
        console.error('[BackupHelper] Failed to remove failed backup file:', unlinkError.message);
      }
    }
    
    throw error;
  }
}

module.exports = {
  backupDatabase,
  ensureBackupDirectory,
  generateBackupFilename,
  formatFileSize,
  verifyBackupIntegrity,
  cleanupOldBackups
};


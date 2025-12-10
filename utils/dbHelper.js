const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');


const dbPath = path.join(__dirname, '..', 'hotspot.db');

function checkDatabaseIntegrity() {
  try {
    if (!fs.existsSync(dbPath)) {
      return {
        valid: false,
        message: 'Database file does not exist',
        details: { path: dbPath }
      };
    }

    const stats = fs.statSync(dbPath);
    if (stats.size === 0) {
      return {
        valid: false,
        message: 'Database file is empty (0 bytes)',
        details: { path: dbPath, size: 0 }
      };
    }

    const db = new Database(dbPath);

    const integrityCheck = db.prepare('PRAGMA integrity_check').get();
    const quickCheck = db.prepare('PRAGMA quick_check').get();
    const fsStats = require('fs').statSync(require('path').dirname(dbPath));
    
    db.close();

    return {
      valid: integrityCheck.integrity_check === 'ok' && quickCheck.quick_check === 'ok',
      message: integrityCheck.integrity_check === 'ok' ? 'Database integrity OK' : 'Database integrity check failed',
      details: {
        integrity_check: integrityCheck.integrity_check,
        quick_check: quickCheck.quick_check,
        file_size: stats.size,
        file_path: dbPath,
        disk_space: fsStats
      }
    };
  } catch (error) {
    return {
      valid: false,
      message: `Error checking database: ${error.message}`,
      details: { error: error.code, path: dbPath }
    };
  }
}

function backupDatabase(backupDir = path.join(__dirname, '..', 'backups')) {
  try {
    if (!fs.existsSync(dbPath)) {
      return {
        success: false,
        error: 'Database file does not exist',
        backupPath: null
      };
    }

    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `hotspot.db.backup.${timestamp}`);

    fs.copyFileSync(dbPath, backupPath);

    return {
      success: true,
      backupPath,
      error: null
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      backupPath: null
    };
  }
}

function repairDatabase() {
  try {
    if (!fs.existsSync(dbPath)) {
      return {
        success: false,
        message: 'Database file does not exist'
      };
    }

    const backup = backupDatabase();
    if (!backup.success) {
      console.warn('[DB Repair] Backup failed, but continuing with repair...');
    }

    const db = new Database(dbPath);
    db.exec('VACUUM');
    const integrityCheck = db.prepare('PRAGMA integrity_check').get();

    db.close();

    if (integrityCheck.integrity_check === 'ok') {
      return {
        success: true,
        message: 'Database repaired successfully',
        backupPath: backup.backupPath
      };
    } else {
      return {
        success: false,
        message: `Repair completed but integrity check still failed: ${integrityCheck.integrity_check}`,
        backupPath: backup.backupPath
      };
    }
  } catch (error) {
    return {
      success: false,
      message: `Error repairing database: ${error.message}`
    };
  }
}

function checkDatabaseLock() {
  try {
    const db = new Database(dbPath, { timeout: 1000 });
    db.prepare('SELECT 1').get();
    db.close();
    return {
      locked: false,
      message: 'Database is not locked'
    };
  } catch (error) {
    if (error.code === 'SQLITE_BUSY' || error.code === 'SQLITE_LOCKED') {
      return {
        locked: true,
        message: 'Database is locked by another process'
      };
    }
    return {
      locked: false,
      message: `Error checking lock: ${error.message}`
    };
  }
}

function getDatabaseStats() {
  try {
    if (!fs.existsSync(dbPath)) {
      return null;
    }

    const stats = fs.statSync(dbPath);
    const db = new Database(dbPath);
    const tableCount = db.prepare(`
      SELECT COUNT(*) as count 
      FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `).get();

    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
    const settingsCount = db.prepare('SELECT COUNT(*) as count FROM settings').get();
    const logCount = db.prepare('SELECT COUNT(*) as count FROM audit_logs').get();

    db.close();

    return {
      file_size: stats.size,
      file_size_mb: (stats.size / 1024 / 1024).toFixed(2),
      created: stats.birthtime,
      modified: stats.mtime,
      tables: tableCount.count,
      users: userCount.count,
      settings: settingsCount.count,
      audit_logs: logCount.count
    };
  } catch (error) {
    return {
      error: error.message
    };
  }
}

module.exports = {
  checkDatabaseIntegrity,
  backupDatabase,
  repairDatabase,
  checkDatabaseLock,
  getDatabaseStats,
  dbPath
};


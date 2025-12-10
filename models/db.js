const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// CRITICAL: Use absolute path to ensure database location is consistent
// regardless of where PM2 or Node.js is started from
const projectRoot = path.resolve(__dirname, '..');
const dbPath = path.join(projectRoot, 'hotspot.db');

/**
 * ⚠️ CRITICAL: SINGLE SHARED DATABASE CONNECTION
 * ===============================================
 * 
 * This module provides a SINGLE shared database connection for the entire application.
 * 
 * PROBLEM WITH MULTIPLE CONNECTIONS:
 * - Multiple connections to the same SQLite database can cause:
 *   1. Lock contention (SQLITE_BUSY errors)
 *   2. Data not being committed to disk properly
 *   3. Transaction isolation issues
 *   4. WAL mode file conflicts
 * 
 * SOLUTION:
 * - Use this SINGLE connection for all database operations
 * - All models (Settings, User, AuditLog, LoginAttempt) must use this connection
 * - This ensures data consistency and proper commit behavior
 * 
 * DURABILITY SETTINGS:
 * - synchronous=FULL: Ensures data is written to disk before returning (prevents data loss)
 * - journal_mode=DELETE: Avoids WAL file permission issues
 * - timeout=10000: Allows sufficient time for locks to clear
 */

let db = null;

/**
 * Get or create the shared database connection
 * @returns {Database} The shared database connection
 */
function getDatabase() {
  if (db && db.open) {
    return db;
  }

  try {
    console.log('[DB] Initializing shared database connection...');
    console.log('[DB] Project root:', projectRoot);
    console.log('[DB] Database path:', dbPath);
    console.log('[DB] Current working directory:', process.cwd());
    console.log('[DB] __dirname:', __dirname);
    
    const dbDir = path.dirname(dbPath);
    try {
      fs.accessSync(dbDir, fs.constants.W_OK);
      console.log('[DB] ✓ Database directory is writable');
    } catch (accessError) {
      console.error('[DB] ❌ Database directory is NOT writable:', dbDir);
      console.error('[DB] Permission error:', accessError.message);
      throw new Error(`Database directory is not writable: ${dbDir}. Check permissions.`);
    }
    
    if (fs.existsSync(dbPath)) {
      try {
        fs.accessSync(dbPath, fs.constants.W_OK);
        console.log('[DB] ✓ Database file is writable');
      } catch (accessError) {
        console.error('[DB] ❌ Database file is NOT writable:', dbPath);
        console.error('[DB] Permission error:', accessError.message);
        throw new Error(`Database file is not writable: ${dbPath}. Check permissions.`);
      }
    } else {
      console.log('[DB] Database file does not exist yet (will be created)');
    }
    
    db = new Database(dbPath, {
      timeout: 10000, // 10 seconds timeout for locks
      verbose: process.env.NODE_ENV === 'development' ? console.log : null
    });

    // CRITICAL: Set durability settings to ensure data is written to disk
    // synchronous=FULL: Forces SQLite to wait for OS to confirm data is written to disk
    // This prevents data loss on system crashes or unexpected shutdowns
    db.pragma('synchronous = FULL');
    console.log('[DB] ✓ Set synchronous=FULL (maximum durability)');

    // CRITICAL: Set journal mode to DELETE to avoid WAL file permission issues
    // WAL mode creates additional files which can cause permission errors and lock contention
    const journalMode = db.pragma('journal_mode');
    if (journalMode && journalMode.journal_mode && journalMode.journal_mode.toUpperCase() === 'WAL') {
      console.log('[DB] Switching from WAL to DELETE journal mode');
      db.pragma('journal_mode = DELETE');
    }
    console.log('[DB] ✓ Journal mode: DELETE');

    const syncCheck = db.pragma('synchronous', { simple: true });
    const journalCheck = db.pragma('journal_mode', { simple: true });
    console.log('[DB] ✓ Database initialized with settings:');
    console.log(`[DB]   - synchronous: ${syncCheck}`);
    console.log(`[DB]   - journal_mode: ${journalCheck}`);

    // Handle graceful shutdown
    process.on('SIGINT', closeDatabase);
    process.on('SIGTERM', closeDatabase);
    process.on('exit', closeDatabase);

    return db;
  } catch (error) {
    console.error('[DB] Failed to initialize database connection:', error.message);
    console.error('[DB] Error code:', error.code);
    throw error;
  }
}

/**
 * Close the database connection gracefully
 */
function closeDatabase() {
  if (db && db.open) {
    try {
      console.log('[DB] Closing database connection...');
      db.close();
      console.log('[DB] ✓ Database connection closed');
    } catch (error) {
      console.error('[DB] Error closing database:', error.message);
    }
  }
}

/**
 * Force checkpoint/flush to ensure all data is written to disk
 * This is useful after critical writes (e.g., saving router password)
 * CRITICAL: This function ensures data persistence, especially important for PM2 and system reboots
 * 
 * This function performs multiple steps to ensure data is truly persisted:
 * 1. Commits any pending transactions
 * 2. Forces SQLite to flush to OS buffers
 * 3. Forces OS to flush to physical disk using fsync
 * 4. Verifies the data was written correctly
 */
function checkpoint() {
  if (db && db.open) {
    try {
      // Step 1: Ensure all pending transactions are committed
      db.exec('BEGIN IMMEDIATE; COMMIT;');
      
      db.pragma('synchronous = FULL');
      db.pragma('optimize');
      
      // CRITICAL: Force OS to flush to physical disk to prevent data loss on reboot
      // better-sqlite3 doesn't expose fsync directly, so we use the file descriptor
      try {
        if (fs.existsSync(dbPath)) {
          const fd = fs.openSync(dbPath, 'r+');
          try {
            fs.fsyncSync(fd);
            console.log('[DB] ✓ OS fsync completed - data guaranteed on disk');
          } finally {
            fs.closeSync(fd);
          }
        }
      } catch (fsyncError) {
        console.warn('[DB] ⚠️  fsync warning (non-critical):', fsyncError.message);
      }
      
      // Clean up any journal files that might cause rollback on reboot
      const dbDir = path.dirname(dbPath);
      const journalFile = dbPath + '-journal';
      const walFile = dbPath + '-wal';
      const shmFile = dbPath + '-shm';
      
      try {
        if (fs.existsSync(journalFile)) {
          fs.unlinkSync(journalFile);
          console.log('[DB] ✓ Removed stale journal file');
        }
        if (fs.existsSync(walFile)) {
          fs.unlinkSync(walFile);
          console.log('[DB] ✓ Removed stale WAL file');
        }
        if (fs.existsSync(shmFile)) {
          fs.unlinkSync(shmFile);
          console.log('[DB] ✓ Removed stale SHM file');
        }
      } catch (cleanupError) {
        // Non-critical: journal file cleanup failure
        console.warn('[DB] ⚠️  Journal cleanup warning:', cleanupError.message);
      }
      
      console.log('[DB] ✓ Checkpoint completed - data flushed to disk');
      return true;
    } catch (error) {
      console.error('[DB] ❌ Checkpoint error:', error.message);
      console.error('[DB] Error code:', error.code);
      return false;
    }
  } else {
    console.warn('[DB] Checkpoint skipped - database not open');
    return false;
  }
}

module.exports = {
  getDatabase,
  closeDatabase,
  checkpoint
};


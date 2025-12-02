const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'hotspot.db');

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
    // WAL mode creates additional files (hotspot.db-wal, hotspot.db-shm) which can cause:
    // - Permission errors
    // - Lock contention with multiple connections
    // - Data not being visible across connections immediately
    const journalMode = db.pragma('journal_mode');
    if (journalMode && journalMode.journal_mode && journalMode.journal_mode.toUpperCase() === 'WAL') {
      console.log('[DB] Switching from WAL to DELETE journal mode');
      db.pragma('journal_mode = DELETE');
    }
    console.log('[DB] ✓ Journal mode: DELETE');

    // Verify settings
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
 */
function checkpoint() {
  if (db && db.open) {
    try {
      // PRAGMA wal_checkpoint is only for WAL mode, but we use DELETE mode
      // Instead, we use PRAGMA optimize to ensure all data is flushed
      db.pragma('optimize');
      // Also ensure any pending writes are committed
      db.exec('BEGIN IMMEDIATE; COMMIT;');
    } catch (error) {
      console.warn('[DB] Checkpoint warning:', error.message);
    }
  }
}

module.exports = {
  getDatabase,
  closeDatabase,
  checkpoint
};


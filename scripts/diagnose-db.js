#!/usr/bin/env node

/**
 * Database Diagnostic Script
 * 
 * Usage: node scripts/diagnose-db.js [--repair] [--backup]
 */

const dbHelper = require('../utils/dbHelper');
const fs = require('fs');
const path = require('path');

console.log('='.repeat(60));
console.log('Database Diagnostic Tool');
console.log('='.repeat(60));
console.log('');

// Parse command line arguments
const args = process.argv.slice(2);
const shouldRepair = args.includes('--repair');
const shouldBackup = args.includes('--backup') || shouldRepair;

// Step 1: Check if database file exists
console.log('Step 1: Checking database file...');
if (!fs.existsSync(dbHelper.dbPath)) {
  console.error('❌ Database file does not exist:', dbHelper.dbPath);
  console.log('\n💡 Solution: Run "npm run setup-db" to create the database.');
  process.exit(1);
}
console.log('✓ Database file exists:', dbHelper.dbPath);
console.log('');

// Step 2: Check file permissions
console.log('Step 2: Checking file permissions...');
try {
  fs.accessSync(dbHelper.dbPath, fs.constants.R_OK | fs.constants.W_OK);
  console.log('✓ Database file is readable and writable');
} catch (error) {
  console.error('❌ Database file permission error:', error.message);
  console.log('\n💡 Solution: Check file permissions with "ls -l hotspot.db"');
  console.log('   Fix permissions: chmod 644 hotspot.db');
  process.exit(1);
}
console.log('');

// Step 3: Check disk space
console.log('Step 3: Checking disk space...');
try {
  const stats = require('fs').statSync(require('path').dirname(dbHelper.dbPath));
  const dbStats = require('fs').statSync(dbHelper.dbPath);
  console.log(`✓ Database file size: ${(dbStats.size / 1024 / 1024).toFixed(2)} MB`);
  
  // Basic check - if file is 0 bytes, disk might be full
  if (dbStats.size === 0) {
    console.error('❌ Database file is 0 bytes - possible disk space issue');
    console.log('\n💡 Solution: Check disk space with "df -h"');
    process.exit(1);
  }
} catch (error) {
  console.error('❌ Error checking file stats:', error.message);
}
console.log('');

// Step 4: Check if database is locked
console.log('Step 4: Checking database lock...');
const lockCheck = dbHelper.checkDatabaseLock();
if (lockCheck.locked) {
  console.error('❌', lockCheck.message);
  console.log('\n💡 Solution:');
  console.log('   1. Check for other Node.js processes: ps aux | grep node');
  console.log('   2. Stop PM2: pm2 stop smansada-hotspot');
  console.log('   3. Check for SQLite processes: lsof hotspot.db');
  process.exit(1);
}
console.log('✓', lockCheck.message);
console.log('');

// Step 5: Check database integrity
console.log('Step 5: Checking database integrity...');
const integrityCheck = dbHelper.checkDatabaseIntegrity();
if (!integrityCheck.valid) {
  console.error('❌', integrityCheck.message);
  console.log('Details:', JSON.stringify(integrityCheck.details, null, 2));
  
  if (shouldRepair) {
    console.log('\n🔧 Attempting to repair database...');
    const repairResult = dbHelper.repairDatabase();
    if (repairResult.success) {
      console.log('✓', repairResult.message);
      if (repairResult.backupPath) {
        console.log('  Backup saved to:', repairResult.backupPath);
      }
    } else {
      console.error('❌', repairResult.message);
      console.log('\n💡 Solution: Restore from backup or run "npm run setup-db" to recreate database.');
      process.exit(1);
    }
  } else {
    console.log('\n💡 Solution: Run with --repair flag to attempt repair:');
    console.log('   node scripts/diagnose-db.js --repair');
    process.exit(1);
  }
} else {
  console.log('✓', integrityCheck.message);
}
console.log('');

// Step 6: Backup database (if requested)
if (shouldBackup) {
  console.log('Step 6: Creating backup...');
  const backupResult = dbHelper.backupDatabase();
  if (backupResult.success) {
    console.log('✓ Backup created:', backupResult.backupPath);
  } else {
    console.warn('⚠️  Backup failed:', backupResult.error);
  }
  console.log('');
}

// Step 7: Database statistics
console.log('Step 7: Database statistics...');
const stats = dbHelper.getDatabaseStats();
if (stats && !stats.error) {
  console.log('  File size:', stats.file_size_mb, 'MB');
  console.log('  Tables:', stats.tables);
  console.log('  Users:', stats.users);
  console.log('  Settings:', stats.settings);
  console.log('  Audit logs:', stats.audit_logs);
  console.log('  Last modified:', stats.modified);
} else if (stats && stats.error) {
  console.warn('⚠️  Could not get statistics:', stats.error);
}
console.log('');

// Summary
console.log('='.repeat(60));
console.log('Diagnostic Summary');
console.log('='.repeat(60));
console.log('✓ Database file exists and is accessible');
console.log('✓ Database is not locked');
console.log('✓ Database integrity check passed');
console.log('');
console.log('Database is healthy and ready to use.');
console.log('');


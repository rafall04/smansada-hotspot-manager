#!/bin/bash

# Complete Database Permissions Fix Script
# Run this script as root or with sudo

set -e

PROJECT_DIR="/root/smansada-hotspot-manager"
DB_FILE="$PROJECT_DIR/hotspot.db"

echo "=========================================="
echo "Database Permissions Fix Script"
echo "=========================================="
echo ""

# Step 1: Stop PM2
echo "Step 1: Stopping PM2..."
pm2 stop all 2>/dev/null || true
pm2 kill 2>/dev/null || true
sleep 2
echo "✓ PM2 stopped"
echo ""

# Step 2: Remove journal files
echo "Step 2: Removing journal files..."
cd "$PROJECT_DIR"
rm -f hotspot.db-journal hotspot.db-wal hotspot.db-shm 2>/dev/null || true
echo "✓ Journal files removed"
echo ""

# Step 3: Fix ownership
echo "Step 3: Fixing ownership..."
chown -R root:root "$PROJECT_DIR"
echo "✓ Ownership fixed"
echo ""

# Step 4: Fix permissions
echo "Step 4: Fixing permissions..."
chmod -R 775 "$PROJECT_DIR"
chmod 664 "$DB_FILE" 2>/dev/null || true
echo "✓ Permissions fixed"
echo ""

# Step 5: Set journal mode to DELETE
echo "Step 5: Setting journal mode to DELETE..."
if command -v sqlite3 &> /dev/null; then
    sqlite3 "$DB_FILE" "PRAGMA journal_mode=DELETE;" 2>/dev/null || echo "⚠️  Could not set journal mode (sqlite3 not found or DB locked)"
    echo "✓ Journal mode set"
else
    echo "⚠️  sqlite3 not found, skipping journal mode setting"
fi
echo ""

# Step 6: Verify database integrity
echo "Step 6: Verifying database integrity..."
if command -v sqlite3 &> /dev/null; then
    INTEGRITY=$(sqlite3 "$DB_FILE" "PRAGMA integrity_check;" 2>/dev/null | head -1)
    if [ "$INTEGRITY" = "ok" ]; then
        echo "✓ Database integrity: OK"
    else
        echo "⚠️  Database integrity check: $INTEGRITY"
    fi
else
    echo "⚠️  sqlite3 not found, skipping integrity check"
fi
echo ""

# Step 7: Test write
echo "Step 7: Testing database write..."
if command -v sqlite3 &> /dev/null; then
    sqlite3 "$DB_FILE" "UPDATE settings SET router_ip = '192.168.88.1' WHERE id = 1;" 2>/dev/null && echo "✓ Write test: SUCCESS" || echo "❌ Write test: FAILED"
else
    echo "⚠️  sqlite3 not found, skipping write test"
fi
echo ""

# Step 8: Show final permissions
echo "Step 8: Final permissions check..."
echo "Directory:"
ls -ld "$PROJECT_DIR"
echo ""
echo "Database file:"
ls -l "$DB_FILE" 2>/dev/null || echo "Database file not found"
echo ""

# Step 9: Restart PM2
echo "Step 9: Restarting PM2..."
cd "$PROJECT_DIR"
pm2 start ecosystem.config.js 2>/dev/null || pm2 restart smansada-hotspot 2>/dev/null || echo "⚠️  PM2 not configured, please start manually"
pm2 save 2>/dev/null || true
echo "✓ PM2 restarted"
echo ""

echo "=========================================="
echo "Fix completed!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Check PM2 logs: pm2 logs smansada-hotspot --lines 50"
echo "2. Test the application"
echo "3. If still having issues, check: npm run db:diagnose"
echo ""


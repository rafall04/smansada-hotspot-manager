#!/bin/bash
# Database Backup Script
# Creates a timestamped backup of the database

set -e  # Exit on error

echo "=========================================="
echo "Database Backup Script"
echo "=========================================="
echo ""

# Get project directory
PROJECT_DIR=$(cd "$(dirname "$0")/.." && pwd)
cd "$PROJECT_DIR"

echo "Project directory: $PROJECT_DIR"
echo ""

# Database file
DB_FILE="$PROJECT_DIR/hotspot.db"
BACKUP_DIR="$PROJECT_DIR/backups"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Check if database exists
if [ ! -f "$DB_FILE" ]; then
    echo "❌ ERROR: Database file not found: $DB_FILE"
    exit 1
fi

# Generate backup filename with timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/hotspot_${TIMESTAMP}.db"

# Create backup
echo "Creating database backup..."
cp "$DB_FILE" "$BACKUP_FILE"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ ERROR: Failed to create backup!"
    exit 1
fi

# Get file sizes
DB_SIZE=$(du -h "$DB_FILE" | cut -f1)
BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)

echo "✓ Backup created successfully"
echo ""
echo "Database: $DB_FILE"
echo "  Size: $DB_SIZE"
echo ""
echo "Backup: $BACKUP_FILE"
echo "  Size: $BACKUP_SIZE"
echo ""

# Verify backup integrity (if sqlite3 is available)
if command -v sqlite3 &> /dev/null; then
    echo "Verifying backup integrity..."
    if sqlite3 "$BACKUP_FILE" "PRAGMA integrity_check;" | grep -q "ok"; then
        echo "✓ Backup integrity verified"
    else
        echo "⚠️  WARNING: Backup integrity check failed!"
        echo "   Backup file may be corrupted."
    fi
    echo ""
fi

# Count existing backups
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/hotspot_*.db 2>/dev/null | wc -l)
echo "Total backups: $BACKUP_COUNT"

# Optional: Clean old backups (keep last 10)
if [ "$BACKUP_COUNT" -gt 10 ]; then
    echo "Cleaning old backups (keeping last 10)..."
    ls -1t "$BACKUP_DIR"/hotspot_*.db 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null || true
    REMAINING=$(ls -1 "$BACKUP_DIR"/hotspot_*.db 2>/dev/null | wc -l)
    echo "✓ Old backups cleaned. Remaining: $REMAINING"
fi

echo ""
echo "=========================================="
echo "Backup Complete"
echo "=========================================="
echo ""
echo "Backup location: $BACKUP_FILE"
echo ""
echo "To restore from backup:"
echo "  cp $BACKUP_FILE hotspot.db"
echo ""


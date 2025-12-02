#!/bin/bash
# Diagnostic script for permission issues on Ubuntu 20.04
# Run this script to identify permission problems

echo "=========================================="
echo "Permission Diagnostic Script"
echo "=========================================="
echo ""

# Get current user
CURRENT_USER=$(whoami)
echo "1. Current User: $CURRENT_USER"
if [ "$CURRENT_USER" = "root" ]; then
    echo "   ⚠️  WARNING: Running as root user!"
    echo "   This is a security risk and can cause permission issues."
fi
echo ""

# Get current directory
CURRENT_DIR=$(pwd)
echo "2. Current Directory: $CURRENT_DIR"
if [[ "$CURRENT_DIR" == /root/* ]]; then
    echo "   ⚠️  WARNING: Project is in /root/ directory!"
    echo "   This can cause permission issues. Move to /home/[USER]/ or /opt/"
fi
echo ""

# Check database file
DB_FILE="$CURRENT_DIR/hotspot.db"
if [ -f "$DB_FILE" ]; then
    echo "3. Database File: $DB_FILE"
    ls -lh "$DB_FILE"
    DB_OWNER=$(stat -c '%U' "$DB_FILE")
    DB_GROUP=$(stat -c '%G' "$DB_FILE")
    DB_PERMS=$(stat -c '%a' "$DB_FILE")
    echo "   Owner: $DB_OWNER"
    echo "   Group: $DB_GROUP"
    echo "   Permissions: $DB_PERMS"
    
    if [ "$DB_OWNER" != "$CURRENT_USER" ] && [ "$CURRENT_USER" != "root" ]; then
        echo "   ⚠️  WARNING: Database file owned by different user!"
    fi
    
    if [ ! -w "$DB_FILE" ]; then
        echo "   ❌ ERROR: Database file is NOT writable!"
    else
        echo "   ✓ Database file is writable"
    fi
else
    echo "3. Database File: NOT FOUND"
    echo "   ⚠️  Database file does not exist. Run 'npm run setup-db' first."
fi
echo ""

# Check directory permissions
echo "4. Directory Permissions:"
ls -ld "$CURRENT_DIR"
DIR_OWNER=$(stat -c '%U' "$CURRENT_DIR")
DIR_GROUP=$(stat -c '%G' "$CURRENT_DIR")
DIR_PERMS=$(stat -c '%a' "$CURRENT_DIR")
echo "   Owner: $DIR_OWNER"
echo "   Group: $DIR_GROUP"
echo "   Permissions: $DIR_PERMS"

if [ "$DIR_OWNER" != "$CURRENT_USER" ] && [ "$CURRENT_USER" != "root" ]; then
    echo "   ⚠️  WARNING: Directory owned by different user!"
fi

if [ ! -w "$CURRENT_DIR" ]; then
    echo "   ❌ ERROR: Directory is NOT writable!"
else
    echo "   ✓ Directory is writable"
fi
echo ""

# Check PM2 process
echo "5. PM2 Process Check:"
if command -v pm2 &> /dev/null; then
    PM2_USER=$(ps aux | grep '[p]m2' | head -1 | awk '{print $1}')
    if [ -n "$PM2_USER" ]; then
        echo "   PM2 running as user: $PM2_USER"
        if [ "$PM2_USER" = "root" ]; then
            echo "   ⚠️  WARNING: PM2 is running as root!"
        fi
    else
        echo "   PM2 process not found (may not be running)"
    fi
else
    echo "   PM2 not installed"
fi
echo ""

# Check Node.js process
echo "6. Node.js Process Check:"
NODE_PROCESSES=$(ps aux | grep '[n]ode' | grep -v grep)
if [ -n "$NODE_PROCESSES" ]; then
    echo "$NODE_PROCESSES" | while read line; do
        NODE_USER=$(echo "$line" | awk '{print $1}')
        NODE_CMD=$(echo "$line" | awk '{for(i=11;i<=NF;i++) printf "%s ", $i; print ""}')
        echo "   User: $NODE_USER"
        echo "   Command: $NODE_CMD"
        if [ "$NODE_USER" = "root" ]; then
            echo "   ⚠️  WARNING: Node.js process running as root!"
        fi
        echo ""
    done
else
    echo "   No Node.js processes found"
fi
echo ""

# Check journal files
echo "7. SQLite Journal Files:"
JOURNAL_FILES=("$DB_FILE-journal" "$DB_FILE-wal" "$DB_FILE-shm")
for journal_file in "${JOURNAL_FILES[@]}"; do
    if [ -f "$journal_file" ]; then
        echo "   Found: $(basename $journal_file)"
        ls -lh "$journal_file"
        J_OWNER=$(stat -c '%U' "$journal_file")
        if [ "$J_OWNER" != "$CURRENT_USER" ] && [ "$CURRENT_USER" != "root" ]; then
            echo "   ⚠️  WARNING: Journal file owned by different user!"
        fi
    fi
done
echo ""

# Check environment variables
echo "8. Environment Variables:"
echo "   USER: ${USER:-not set}"
echo "   HOME: ${HOME:-not set}"
echo "   PWD: ${PWD:-not set}"
echo ""

# Summary
echo "=========================================="
echo "SUMMARY"
echo "=========================================="
ISSUES=0

if [ "$CURRENT_USER" = "root" ]; then
    echo "❌ Issue 1: Running as root user"
    ISSUES=$((ISSUES + 1))
fi

if [[ "$CURRENT_DIR" == /root/* ]]; then
    echo "❌ Issue 2: Project in /root/ directory"
    ISSUES=$((ISSUES + 1))
fi

if [ -f "$DB_FILE" ] && [ ! -w "$DB_FILE" ]; then
    echo "❌ Issue 3: Database file not writable"
    ISSUES=$((ISSUES + 1))
fi

if [ ! -w "$CURRENT_DIR" ]; then
    echo "❌ Issue 4: Directory not writable"
    ISSUES=$((ISSUES + 1))
fi

if [ $ISSUES -eq 0 ]; then
    echo "✓ No obvious permission issues detected"
    echo ""
    echo "If you still experience permission errors, check:"
    echo "  1. SELinux/AppArmor policies"
    echo "  2. Disk space (df -h)"
    echo "  3. File system mount options"
else
    echo ""
    echo "⚠️  Found $ISSUES issue(s). Run fix-permissions.sh to fix them."
fi
echo ""


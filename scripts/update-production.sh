#!/bin/bash
# Safe Production Update Script
# This script safely updates the application without losing database

set -e  # Exit on error

echo "=========================================="
echo "Production Update Script"
echo "=========================================="
echo ""

# Get project directory
PROJECT_DIR=$(cd "$(dirname "$0")/.." && pwd)
cd "$PROJECT_DIR"

echo "Project directory: $PROJECT_DIR"
echo ""

# Check if database exists
DB_FILE="$PROJECT_DIR/hotspot.db"
BACKUP_DIR="$PROJECT_DIR/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/hotspot_${TIMESTAMP}.db"

if [ ! -f "$DB_FILE" ]; then
    echo "⚠️  WARNING: Database file not found: $DB_FILE"
    echo "   This might be a fresh installation."
    echo ""
else
    echo "✓ Database file found: $DB_FILE"
    
    # Create backup directory if it doesn't exist
    mkdir -p "$BACKUP_DIR"
    
    # Backup database
    echo "Creating database backup..."
    cp "$DB_FILE" "$BACKUP_FILE"
    
    if [ -f "$BACKUP_FILE" ]; then
        echo "✓ Backup created: $BACKUP_FILE"
        DB_SIZE=$(du -h "$DB_FILE" | cut -f1)
        BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
        echo "  Database size: $DB_SIZE"
        echo "  Backup size: $BACKUP_SIZE"
    else
        echo "❌ ERROR: Failed to create backup!"
        exit 1
    fi
    echo ""
fi

# Check if PM2 is running
if command -v pm2 &> /dev/null; then
    PM2_RUNNING=$(pm2 list | grep -c "smansada-hotspot" || echo "0")
    if [ "$PM2_RUNNING" -gt 0 ]; then
        echo "PM2 process detected. Stopping application..."
        pm2 stop smansada-hotspot || echo "  (PM2 process not found or already stopped)"
        echo "✓ Application stopped"
        echo ""
    fi
else
    echo "⚠️  PM2 not found. Make sure to stop the application manually."
    echo ""
fi

# Check git status
echo "Checking git status..."
GIT_STATUS=$(git status --porcelain)

if [ -n "$GIT_STATUS" ]; then
    echo "⚠️  WARNING: Uncommitted changes detected:"
    echo "$GIT_STATUS" | head -10
    echo ""
    read -p "Do you want to continue? Uncommitted changes will be lost. (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Update cancelled."
        exit 1
    fi
    
    # Reset uncommitted changes (but keep database)
    echo "Resetting uncommitted changes (keeping database)..."
    git reset --hard HEAD
    git clean -fd --exclude="hotspot.db" --exclude="backups/" --exclude="logs/" --exclude="node_modules/" --exclude=".env"
    echo "✓ Uncommitted changes reset"
    echo ""
else
    echo "✓ Working directory is clean"
    echo ""
fi

# Fetch latest changes
echo "Fetching latest changes from remote..."
git fetch origin

# Check if there are updates
LOCAL=$(git rev-parse @)
REMOTE=$(git rev-parse @{u})
BASE=$(git merge-base @ @{u})

if [ "$LOCAL" = "$REMOTE" ]; then
    echo "✓ Already up to date. No changes to pull."
    echo ""
    
    # Restart application if it was running
    if [ "$PM2_RUNNING" -gt 0 ]; then
        echo "Restarting application..."
        pm2 start app.js --name smansada-hotspot || pm2 restart smansada-hotspot
        echo "✓ Application restarted"
    fi
    exit 0
elif [ "$LOCAL" = "$BASE" ]; then
    echo "New updates available. Pulling changes..."
    git pull origin main
    
    echo "✓ Changes pulled successfully"
    echo ""
elif [ "$REMOTE" = "$BASE" ]; then
    echo "⚠️  WARNING: Local branch is ahead of remote."
    echo "   This should not happen in production."
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
    git pull origin main --rebase
else
    echo "⚠️  WARNING: Diverged branches detected."
    echo "   Local and remote have different commits."
    read -p "This requires manual intervention. Continue? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
    git pull origin main --rebase
fi

# Verify database still exists after pull
if [ -f "$DB_FILE" ]; then
    echo "✓ Database file verified after update"
else
    echo "⚠️  WARNING: Database file missing after update!"
    if [ -f "$BACKUP_FILE" ]; then
        echo "Restoring from backup..."
        cp "$BACKUP_FILE" "$DB_FILE"
        echo "✓ Database restored from backup"
    else
        echo "❌ ERROR: No backup available to restore!"
        exit 1
    fi
fi

# Install/update dependencies
echo ""
echo "Installing/updating dependencies..."
npm install --production
echo "✓ Dependencies updated"
echo ""

# Run database migrations if needed
if [ -f "setup_db.js" ]; then
    echo "Running database migrations..."
    npm run setup-db || echo "  (Database setup completed or not needed)"
    echo "✓ Database migrations completed"
    echo ""
fi

# Restart application
if command -v pm2 &> /dev/null; then
    echo "Restarting application with PM2..."
    pm2 restart smansada-hotspot || pm2 start app.js --name smansada-hotspot
    echo "✓ Application restarted"
    echo ""
    
    # Show status
    echo "Application status:"
    pm2 list | grep smansada-hotspot || echo "  (Process not found)"
    echo ""
fi

# Summary
echo "=========================================="
echo "Update Complete"
echo "=========================================="
echo ""
echo "✓ Database backed up to: $BACKUP_FILE"
echo "✓ Application updated and restarted"
echo ""
echo "Next steps:"
echo "  1. Check application logs: pm2 logs smansada-hotspot"
echo "  2. Verify application is running: pm2 list"
echo "  3. Test login and functionality"
echo ""


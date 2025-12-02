#!/bin/bash
# Fix permission issues for Ubuntu 20.04 deployment
# This script will:
# 1. Create a dedicated user if needed
# 2. Move project out of /root/ if needed
# 3. Fix file ownership and permissions
# 4. Configure PM2 to run as non-root user

set -e  # Exit on error

echo "=========================================="
echo "Permission Fix Script for Ubuntu 20.04"
echo "=========================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "❌ This script must be run as root (use sudo)"
    exit 1
fi

# Get current directory
CURRENT_DIR=$(pwd)
echo "Current directory: $CURRENT_DIR"
echo ""

# Determine target user
if [ -n "$SUDO_USER" ]; then
    TARGET_USER="$SUDO_USER"
else
    read -p "Enter username to run the application (default: hotspot-manager): " TARGET_USER
    TARGET_USER=${TARGET_USER:-hotspot-manager}
fi

echo "Target user: $TARGET_USER"
echo ""

# Check if user exists, create if not
if ! id "$TARGET_USER" &>/dev/null; then
    echo "Creating user: $TARGET_USER"
    useradd -m -s /bin/bash "$TARGET_USER"
    echo "✓ User created"
else
    echo "✓ User already exists"
fi
echo ""

# Determine target directory
if [[ "$CURRENT_DIR" == /root/* ]]; then
    TARGET_DIR="/home/$TARGET_USER/smansada-hotspot-manager"
    echo "⚠️  Project is in /root/. Moving to: $TARGET_DIR"
    
    # Create target directory
    mkdir -p "$TARGET_DIR"
    
    # Copy files (preserving structure)
    echo "Copying files..."
    rsync -av --exclude 'node_modules' --exclude '.git' "$CURRENT_DIR/" "$TARGET_DIR/"
    
    # Copy node_modules if it exists
    if [ -d "$CURRENT_DIR/node_modules" ]; then
        echo "Copying node_modules (this may take a while)..."
        rsync -av "$CURRENT_DIR/node_modules/" "$TARGET_DIR/node_modules/"
    fi
    
    echo "✓ Files copied"
    echo ""
    echo "⚠️  IMPORTANT: Update your PM2 configuration to use: $TARGET_DIR"
    echo ""
else
    TARGET_DIR="$CURRENT_DIR"
    echo "✓ Project directory is OK: $TARGET_DIR"
fi
echo ""

# Fix ownership
echo "Fixing file ownership..."
chown -R "$TARGET_USER:$TARGET_USER" "$TARGET_DIR"
echo "✓ Ownership fixed"
echo ""

# Fix permissions
echo "Fixing file permissions..."
chmod -R 755 "$TARGET_DIR"
chmod 664 "$TARGET_DIR/hotspot.db" 2>/dev/null || echo "  (Database file will be created on first run)"
chmod +x "$TARGET_DIR/app.js" 2>/dev/null || true
echo "✓ Permissions fixed"
echo ""

# Remove SQLite journal files (they can cause issues)
echo "Cleaning up SQLite journal files..."
cd "$TARGET_DIR"
rm -f hotspot.db-journal hotspot.db-wal hotspot.db-shm 2>/dev/null || true
echo "✓ Journal files cleaned"
echo ""

# Set journal mode to DELETE (if database exists)
if [ -f "$TARGET_DIR/hotspot.db" ]; then
    echo "Setting SQLite journal mode to DELETE..."
    if command -v sqlite3 &> /dev/null; then
        sqlite3 "$TARGET_DIR/hotspot.db" "PRAGMA journal_mode=DELETE;" 2>/dev/null || echo "  (Could not set journal mode - will be set on app start)"
        echo "✓ Journal mode set"
    else
        echo "  ⚠️  sqlite3 not installed - journal mode will be set on app start"
    fi
    echo ""
fi

# Install PM2 globally for the target user (if not installed)
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2 globally..."
    npm install -g pm2
    echo "✓ PM2 installed"
    echo ""
fi

# Stop PM2 if running as root
if pm2 list &>/dev/null; then
    echo "Stopping existing PM2 processes..."
    pm2 delete all 2>/dev/null || true
    pm2 kill 2>/dev/null || true
    echo "✓ PM2 stopped"
    echo ""
fi

# Summary
echo "=========================================="
echo "FIX COMPLETE"
echo "=========================================="
echo ""
echo "✓ User created/verified: $TARGET_USER"
echo "✓ Project directory: $TARGET_DIR"
echo "✓ Ownership fixed"
echo "✓ Permissions fixed"
echo "✓ Journal files cleaned"
echo ""
echo "NEXT STEPS:"
echo "==========="
echo ""
echo "1. Switch to the target user:"
echo "   sudo su - $TARGET_USER"
echo ""
echo "2. Navigate to project directory:"
echo "   cd $TARGET_DIR"
echo ""
echo "3. Install dependencies (if needed):"
echo "   npm install"
echo ""
echo "4. Setup database:"
echo "   npm run setup-db"
echo ""
echo "5. Start application with PM2:"
echo "   pm2 start ecosystem.config.js"
echo "   pm2 save"
echo "   pm2 startup"
echo ""
echo "6. Verify it's running:"
echo "   pm2 list"
echo "   pm2 logs"
echo ""
echo "⚠️  IMPORTANT:"
echo "   - Never run the application as root"
echo "   - Always use the dedicated user: $TARGET_USER"
echo "   - Project should be in: $TARGET_DIR"
echo ""


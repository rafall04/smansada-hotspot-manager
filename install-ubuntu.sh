#!/bin/bash

# Installation script untuk Ubuntu 20.04
# Script ini akan menginstall semua dependencies yang diperlukan

set -e

echo "=========================================="
echo "Installing Dependencies for Ubuntu 20.04"
echo "=========================================="

# Update package list
echo "[1/7] Updating package list..."
sudo apt update

# Install build essentials
echo "[2/7] Installing build essentials..."
sudo apt install -y build-essential python3-dev make

# Install g++-11 (mendukung C++20)
echo "[3/7] Installing g++-11..."
sudo add-apt-repository -y ppa:ubuntu-toolchain-r/test
sudo apt update
sudo apt install -y g++-11 gcc-11

# Set g++-11 sebagai default
echo "[4/7] Setting g++-11 as default..."
sudo update-alternatives --install /usr/bin/g++ g++ /usr/bin/g++-11 100
sudo update-alternatives --install /usr/bin/gcc gcc /usr/bin/gcc-11 100

# Install SQLite development libraries
echo "[5/7] Installing SQLite development libraries..."
sudo apt install -y libsqlite3-dev

# Verify compiler version
echo "[6/7] Verifying compiler version..."
g++ --version
gcc --version

# Check Node.js version
echo "[6.5/7] Checking Node.js version..."
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -ge 24 ]; then
    echo "WARNING: Node.js v24+ detected. better-sqlite3 requires Node.js LTS (v20)."
    echo "Installing Node.js LTS using nvm..."
    if ! command -v nvm &> /dev/null; then
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    fi
    nvm install 20
    nvm use 20
    nvm alias default 20
    echo "Node.js version: $(node -v)"
fi

# Install Node modules
echo "[7/7] Installing Node.js dependencies..."
npm cache clean --force
npm install

echo "=========================================="
echo "Installation Complete!"
echo "=========================================="
echo "You can now run: npm run setup-db"
echo "Then start the server: npm start"


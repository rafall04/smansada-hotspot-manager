# Quick Fix: Rebuild better-sqlite3 untuk Node.js v24

## Masalah
Module `better-sqlite3` dikompilasi untuk Node.js versi berbeda (NODE_MODULE_VERSION 115 vs 137).

## Solusi Cepat: Rebuild Module

```bash
# Rebuild better-sqlite3 untuk Node.js v24
npm rebuild better-sqlite3

# Atau rebuild semua native modules
npm rebuild
```

## Jika Rebuild Gagal (Karena V8 API Incompatibility)

Downgrade ke Node.js LTS v20:

```bash
# Install NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc

# Install Node.js LTS v20
nvm install 20
nvm use 20
nvm alias default 20

# Verifikasi
node -v  # Harus v20.x.x

# Rebuild module
npm rebuild better-sqlite3

# Setup database
npm run setup-db
```

## Solusi Permanen: Gunakan Node.js LTS

Untuk production, **WAJIB** menggunakan Node.js LTS (v20):

```bash
# Hapus Node.js v24
sudo apt remove nodejs npm
sudo apt autoremove

# Install Node.js LTS v20 via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verifikasi
node -v  # Harus v20.x.x

# Rebuild dan setup
npm rebuild better-sqlite3
npm run setup-db
```


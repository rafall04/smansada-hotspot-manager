# Fix: Node.js Version Compatibility Issue

## Masalah

Error runtime `better-sqlite3` terjadi karena **Node.js v24.11.1 TIDAK kompatibel** dengan `better-sqlite3` v9.2.2.

### Error yang Muncul

```
Error: The module was compiled against a different Node.js version using
NODE_MODULE_VERSION 115. This version of Node.js requires
NODE_MODULE_VERSION 137.
```

Ini berarti module dikompilasi untuk Node.js v20 (NODE_MODULE_VERSION 115), tapi Anda menjalankan Node.js v24 (NODE_MODULE_VERSION 137).

### Root Cause

Node.js v24 menggunakan V8 API yang berbeda dari versi sebelumnya. `better-sqlite3` v9.2.2 belum diupdate untuk mendukung perubahan API ini, menyebabkan error:

- `Local<v8::String>` tidak bisa dikonversi ke `Local<v8::Value>`
- Struktur `Addon` tidak memiliki member yang diharapkan
- V8 API changes di Node.js v24

## Solusi Cepat: Rebuild Module (Temporary Fix)

Jika Anda tetap ingin menggunakan Node.js v24, coba rebuild module:

```bash
npm rebuild better-sqlite3
# atau
npm rebuild
```

**CATATAN**: Rebuild mungkin masih gagal karena incompatibility V8 API. Jika gagal, **WAJIB** downgrade ke Node.js v20.

## Solusi Permanen: Downgrade ke Node.js LTS (v20)

### Opsi 1: Menggunakan NVM (Recommended)

```bash
# Install NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc

# Install Node.js LTS (v20)
nvm install 20
nvm use 20
nvm alias default 20

# Verifikasi
node -v  # Harus menunjukkan v20.x.x
npm -v

# Clear cache dan install
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

### Opsi 2: Install Node.js LTS via NodeSource

```bash
# Install Node.js LTS (v20)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verifikasi
node -v  # Harus menunjukkan v20.x.x

# Clear cache dan install
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

### Opsi 3: Hapus Node.js v24 dan Install v20

```bash
# Hapus Node.js v24
sudo apt remove nodejs npm
sudo apt autoremove

# Install Node.js LTS via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verifikasi
node -v  # Harus menunjukkan v20.x.x

# Clear cache dan install
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

## Verifikasi Setelah Install

```bash
# Check Node.js version
node -v  # Harus v20.x.x

# Check npm version
npm -v

# Install dependencies
npm install

# Setup database
npm run setup-db

# Start server
npm start
```

## Catatan Penting

- **Node.js v24** menggunakan V8 engine terbaru dengan API changes
- **better-sqlite3 v9.2.2** belum mendukung Node.js v24
- **Node.js LTS (v20)** adalah versi yang stabil dan kompatibel
- Disarankan selalu menggunakan **LTS version** untuk production

## Troubleshooting

### Masih Error Setelah Downgrade?

```bash
# Clear semua cache dan rebuild
rm -rf node_modules package-lock.json
npm cache clean --force
npm install

# Jika masih error, coba rebuild better-sqlite3
cd node_modules/better-sqlite3
npm run build-release
cd ../..
```

### Error: "nvm: command not found"

Setelah install nvm, jalankan:
```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
```

Atau tambahkan ke `~/.bashrc`:
```bash
echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.bashrc
echo '[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"' >> ~/.bashrc
source ~/.bashrc
```


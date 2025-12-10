# Format .env File yang Benar

## ⚠️ Migrasi dari Format Lama

Jika file `.env` Anda menggunakan format lama (`MIKROTIK_*`), jalankan:

```bash
npm run env:fix
```

Ini akan otomatis migrate ke format baru (`ROUTER_*`).

**Mapping:**
- `MIKROTIK_HOST` → `ROUTER_IP`
- `MIKROTIK_PORT` → `ROUTER_PORT`
- `MIKROTIK_USER` → `ROUTER_USER`
- `MIKROTIK_PASSWORD` → `ROUTER_PASSWORD_ENCRYPTED`

**Catatan:** Format lama masih didukung untuk backward compatibility, tapi **disarankan untuk migrate ke format baru**.

## 📋 Format Standar

File `.env` harus mengikuti format berikut:

```env
# Session Secret (min 32 characters recommended)
SESSION_SECRET=your-super-secret-session-key-change-this-in-production-min-32-chars

# Encryption Key for AES-256 (must be exactly 64 hex characters = 32 bytes)
ENCRYPTION_KEY=abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890

# Initialization Vector for AES-256-CBC (must be exactly 32 hex characters = 16 bytes)
IV=1234567890abcdef1234567890abcdef

# Server Port (optional, default: 3000)
PORT=3000

# Router Configuration (optional, but recommended for production)
ROUTER_IP=192.168.88.1
ROUTER_PORT=8728
ROUTER_USER=admin
# ROUTER_PASSWORD_ENCRYPTED must be encrypted (not plain text)
# Generate encrypted password: node scripts/setup-router-env.js your_password
ROUTER_PASSWORD_ENCRYPTED=encrypted_hex_string_here
```

## ✅ Format yang Benar

### 1. Tanpa Quotes (Recommended)

```env
SESSION_SECRET=my-secret-key
ROUTER_IP=192.168.88.1
ROUTER_USER=admin
```

**Kenapa?** `dotenv` package otomatis menghandle quotes jika diperlukan. Tidak perlu quotes untuk nilai sederhana.

### 2. Tanpa Spasi di Sekitar `=`

```env
# ✅ Benar
KEY=value

# ❌ Salah
KEY = value
KEY= value
KEY =value
```

### 3. Nilai dengan Spasi (Opsional: Gunakan Quotes)

```env
# ✅ Benar (tanpa quotes jika tidak ada spasi)
SESSION_SECRET=my-secret-key

# ✅ Benar (dengan quotes jika ada spasi)
SESSION_SECRET="my secret key with spaces"

# ✅ Benar (dengan single quotes)
SESSION_SECRET='my secret key with spaces'
```

### 4. Comments

```env
# Ini adalah comment
SESSION_SECRET=my-secret-key

# Comment di akhir baris tidak didukung
SESSION_SECRET=my-secret-key # ini bukan comment
```

## ❌ Format yang Salah

### 1. Spasi di Sekitar `=`

```env
# ❌ Salah
SESSION_SECRET = my-secret-key
ROUTER_IP = 192.168.88.1
```

### 2. Quotes yang Tidak Perlu

```env
# ❌ Salah (quotes tidak perlu untuk nilai sederhana)
SESSION_SECRET="my-secret-key"
ROUTER_IP="192.168.88.1"
ROUTER_PORT="8728"
```

**Catatan:** Quotes diperbolehkan, tapi tidak diperlukan untuk nilai tanpa spasi.

### 3. Missing `=`

```env
# ❌ Salah
SESSION_SECRET my-secret-key
ROUTER_IP 192.168.88.1
```

### 4. Multiple `=` dalam Satu Baris

```env
# ❌ Salah (akan menyebabkan parsing error)
SESSION_SECRET=my=secret=key
```

**Solusi:** Jika nilai mengandung `=`, gunakan quotes:
```env
# ✅ Benar
SESSION_SECRET="my=secret=key"
```

## 🔍 Validasi

Gunakan script validasi untuk mengecek format:

```bash
# Validasi format
npm run env:validate

# Validasi dan perbaiki otomatis
npm run env:fix
```

## 📝 Contoh File .env Lengkap

```env
# ============================================
# Application Configuration
# ============================================

# Session Secret (min 32 characters)
SESSION_SECRET=your-super-secret-session-key-change-this-in-production-min-32-chars

# Encryption Key (64 hex characters = 32 bytes)
# Generate dengan: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890

# Initialization Vector (32 hex characters = 16 bytes)
# Generate dengan: node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
IV=1234567890abcdef1234567890abcdef

# Server Port
PORT=3000

# ============================================
# Router Configuration (PRIMARY - Recommended)
# ============================================

# Router IP Address
ROUTER_IP=192.168.88.1

# Router API Port (default: 8728)
ROUTER_PORT=8728

# Router Username
ROUTER_USER=admin

# Router Password (encrypted)
# Generate dengan: node scripts/setup-router-env.js your_password
ROUTER_PASSWORD_ENCRYPTED=encrypted_hex_string_here
```

## 🐛 Troubleshooting

### Masalah: Environment variables tidak terbaca

**Cek format:**
```bash
npm run env:validate
```

**Perbaiki otomatis:**
```bash
npm run env:fix
```

### Masalah: Password masih plain text

**Warning:** `ROUTER_PASSWORD_ENCRYPTED` harus berisi encrypted password, bukan plain text.

**Solusi:**
```bash
# Generate encrypted password
node scripts/setup-router-env.js your_plain_password

# Copy encrypted value ke .env file
# ROUTER_PASSWORD_ENCRYPTED=paste_encrypted_value_here
```

**Catatan:** Aplikasi masih bisa bekerja dengan plain password (akan di-encrypt on-the-fly), tapi **disarankan untuk encrypt** untuk keamanan.

### Masalah: Menggunakan format lama (MIKROTIK_*)

**Solusi:**
```bash
# Auto-migrate ke format baru
npm run env:fix
```

Atau edit manual:
- `MIKROTIK_HOST` → `ROUTER_IP`
- `MIKROTIK_PORT` → `ROUTER_PORT`
- `MIKROTIK_USER` → `ROUTER_USER`
- `MIKROTIK_PASSWORD` → `ROUTER_PASSWORD_ENCRYPTED` (dan encrypt password)

### Masalah: Quotes dihapus setelah fix

**Ini normal!** Quotes tidak diperlukan untuk nilai tanpa spasi. `dotenv` akan membaca nilai dengan benar tanpa quotes.

### Masalah: Spasi di sekitar `=` tidak terdeteksi

Script validasi akan mendeteksi dan memperbaiki spasi di sekitar `=` secara otomatis.

## 📚 Referensi

- [dotenv Documentation](https://github.com/motdotla/dotenv)
- `SETUP_ROUTER_ENV.md` - Setup router config dengan environment variables
- `scripts/validate-env.js` - Script validasi dan perbaikan

---

**Last Updated**: 2025-01-02


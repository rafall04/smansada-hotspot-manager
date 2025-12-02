# Setup Guide - Mikrotik Hotspot Management System v2.0

## Prerequisites

- Node.js (v14 atau lebih baru)
- npm atau yarn
- Akses ke Router Mikrotik dengan API enabled

## Installation

1. **Clone atau download project**

   ```bash
   cd tools-smansada
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Setup Environment Variables**

   Copy file `.env.example` ke `.env`:

   ```bash
   cp .env.example .env
   ```

   Edit file `.env` dan isi dengan nilai yang sesuai:

   ```env
   # Session Secret (min 32 characters recommended)
   SESSION_SECRET=your-super-secret-session-key-change-this-in-production-min-32-chars

   # Encryption Key for AES-256 (must be exactly 32 bytes/characters)
   # Generate dengan command:
   # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ENCRYPTION_KEY=your-32-character-encryption-key-here

   # Initialization Vector for AES-256-CBC (must be exactly 16 bytes/characters)
   # Generate dengan command:
   # node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
   IV=your-16-character-iv-here

   # Server Port
   PORT=3000
   ```

   **PENTING**:
   - `ENCRYPTION_KEY` harus tepat 32 karakter (hex string)
   - `IV` harus tepat 16 karakter (hex string)
   - Jangan commit file `.env` ke repository!

4. **Generate Encryption Keys (Jika belum ada)**

   Jalankan di terminal:

   ```bash
   node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
   node -e "console.log('IV=' + require('crypto').randomBytes(16).toString('hex'))"
   ```

   Copy output ke file `.env`.

5. **Setup Database**

   ```bash
   npm run setup-db
   ```

   Ini akan:
   - Membuat tabel users, settings, sessions
   - Menambahkan kolom `password_encrypted_viewable` jika belum ada
   - Menambahkan kolom `router_password_encrypted` jika belum ada
   - Membuat user admin default (username: `admin`, password: `admin123`)

6. **Start Server**

   Development mode (dengan auto-reload):

   ```bash
   npm run dev
   ```

   Production mode:

   ```bash
   npm start
   ```

7. **Akses Aplikasi**

   Buka browser: `http://localhost:3000`

   Login dengan:
   - Username: `admin`
   - Password: `admin123`

   **PENTING**: Ganti password admin setelah login pertama!

## First Time Setup

### 1. Login sebagai Admin

Setelah login pertama, segera:

- Ganti password admin di Settings
- Setup koneksi Router Mikrotik di Admin → Settings

### 2. Setup Router Mikrotik

1. Buka **Admin → Settings**
2. Isi:
   - Router IP Address (contoh: 192.168.88.1)
   - Router Port (default: 8728)
   - Router Username
   - Router Password (akan dienkripsi sebelum disimpan)
3. Klik "Test Connection" untuk verifikasi
4. Save settings

### 3. Tambah User

Ada 2 opsi:

**Opsi 1: User Sudah Ada di Mikrotik**

- Pilih "User Sudah Ada di Mikrotik"
- Isi Username, Password (Login Web), Comment ID
- Klik "Verifikasi" untuk cek Comment ID
- Submit

**Opsi 2: User Baru + Buat di Mikrotik**

- Pilih "User Baru + Buat di Mikrotik"
- Isi semua field termasuk Username Hotspot, Password Hotspot, Profile
- Klik "Muat Profile" untuk load daftar profile dari Mikrotik
- Pilih Profile (wajib)
- Klik "Verifikasi" untuk cek Comment ID belum ada
- Submit

## Security Features

### Password Encryption

- **Bcrypt**: Untuk password login (one-way hash)
- **AES-256-CBC**: Untuk password yang bisa dilihat admin (recovery)

### Router Password Encryption

Password router dienkripsi dengan AES-256 sebelum disimpan di database. Hanya didekripsi saat melakukan koneksi ke Mikrotik.

### Session Persistence

Menggunakan `connect-sqlite3` untuk menyimpan session di database. Mencegah logout massal saat server restart.

## Troubleshooting

### Error: "ENCRYPTION_KEY not set"

Pastikan file `.env` ada dan berisi `ENCRYPTION_KEY` yang valid (32 karakter).

### Error: "Failed to decrypt router password"

Password router mungkin masih dalam format lama (plain text). Re-enter password router di Settings untuk dienkripsi ulang.

### Error: "Comment ID tidak ditemukan"

- Pastikan Comment ID sudah ada di Mikrotik (untuk opsi "User Sudah Ada")
- Atau pastikan Comment ID belum ada (untuk opsi "User Baru")

### Session tidak persist

Pastikan `connect-sqlite3` sudah terinstall:

```bash
npm install connect-sqlite3
```

## Production Deployment

1. **Set Environment Variables**
   - Gunakan environment variables yang kuat
   - Jangan hardcode secrets di code

2. **Database Backup**
   - Backup file `hotspot.db` secara berkala
   - Simpan encryption keys dengan aman

3. **HTTPS**
   - Gunakan HTTPS di production
   - Set `secure: true` untuk session cookies

4. **Firewall**
   - Hanya buka port yang diperlukan
   - Restrict akses ke router Mikrotik

## Support

Untuk masalah atau pertanyaan, silakan buka issue di repository atau hubungi tim development.

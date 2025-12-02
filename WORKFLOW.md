# Workflow Dokumentasi - Mikrotik Hotspot Management System (v2.0)

## Table of Contents

1. [Overview & Tech Stack](#overview--tech-stack)
2. [Security Architecture (CRITICAL)](#security-architecture-critical)
3. [Database Schema](#database-schema)
4. [Project Structure (MVC)](#project-structure-mvc)
5. [User Flow: Admin](#user-flow-admin)
6. [User Flow: Guru](#user-flow-guru)
7. [Mikrotik Integration Strategy](#mikrotik-integration-strategy)

---

## Overview & Tech Stack

Sistem manajemen hotspot sekolah yang memprioritaskan kemudahan operasional (Admin bisa melihat password guru) namun tetap menjaga standar keamanan data.

- **Runtime:** Node.js + Express.js
- **Database:** SQLite3 (`better-sqlite3`)
- **Session Store:** `connect-sqlite3` (Persistent Session)
- **Encryption:** Node.js native `crypto` module (AES-256-CBC)
- **Mikrotik Lib:** `node-routeros` (Promise-based)
- **Frontend:** EJS + Bootstrap 5

---

## Security Architecture (CRITICAL)

### 1. Dual-Layer Password Storage (Teacher Accounts)

Karena admin perlu melihat password guru (karena sering lupa), kita menerapkan dua metode penyimpanan untuk setiap user:

1. **`password_hash`**: Menggunakan **Bcrypt**. Digunakan sistem untuk memvalidasi login. (Tidak bisa dibaca balik).

2. **`password_encrypted_viewable`**: Menggunakan **AES-256-CBC**. Digunakan HANYA untuk fitur "Show Password" di Admin Panel.
   - **Syarat:** Harus ada `ENCRYPTION_KEY` (32 chars) dan `IV` di file `.env`. Jangan hardcode di source code.
   - **Flow:** Saat create user → Hash password (untuk login) DAN Encrypt password (untuk recovery).

### 2. Router Credentials Security

Password untuk login ke Router Mikrotik yang disimpan di tabel `settings` **WAJIB** dienkripsi (AES-256) sebelum masuk database. Hanya didekripsi sesaat sebelum melakukan koneksi API.

---

## Database Schema

### Table: `users`

Menyimpan data login Web App.

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,          -- Bcrypt (Untuk Login)
  password_encrypted_viewable TEXT,     -- AES-256 (Untuk Admin "Intip" Password)
  role TEXT NOT NULL DEFAULT 'guru',    -- 'admin' or 'guru'
  mikrotik_comment_id TEXT,             -- KUNCI UTAMA (NIP/Kode Unik)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Table: `settings`

Menyimpan konfigurasi koneksi Router. Hanya ada 1 baris.

```sql
CREATE TABLE settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  router_ip TEXT NOT NULL DEFAULT '192.168.88.1',
  router_port INTEGER NOT NULL DEFAULT 8728,
  router_user TEXT NOT NULL DEFAULT 'admin',
  router_password_encrypted TEXT NOT NULL DEFAULT '', -- AES-256 Encrypted
  CHECK (id = 1)
);
```

### Table: `sessions`

Dikelola otomatis oleh library `connect-sqlite3`. Mencegah logout massal saat server restart.

---

## Project Structure (MVC)

```text
project/
├── config/
│   └── db.js               # Init SQLite tables & Default Admin
├── utils/
│   └── cryptoHelper.js     # Fungsi encrypt() dan decrypt()
├── controllers/
│   ├── adminController.js  # User Management & Settings
│   ├── authController.js   # Login/Logout logic
│   └── guruController.js   # Change hotspot pass & Kick
├── services/
│   └── mikrotikService.js  # Handle connection & commands
├── middlewares/
│   └── authMiddleware.js   # Check Session & Role
├── routes/                 # Express Routes
├── views/                  # EJS Templates
│   ├── admin/              # users.ejs, settings.ejs, dashboard.ejs
│   └── guru/               # dashboard.ejs
└── .env                    # SESSION_SECRET, ENCRYPTION_KEY
```

---

## User Flow: Admin

### 1. Router Connection Setup

- **Page:** `/admin/settings`
- **Action:** Input IP, Port, User, Password Router.
- **Backend Process:**
  1. Terima Password Router.
  2. Panggil `cryptoHelper.encrypt(password)`.
  3. Simpan _Ciphertext_ ke tabel `settings`.
  4. Lakukan Test Connection (Decrypt sementara → Connect → Close).

### 2. User Management (CRUD)

#### A. View Users (The "Reveal" Feature)

- **Page:** `/admin/users`
- **Display:** Tabel User. Kolom Password menampilkan `********` dan tombol **[Eye Icon]**.
- **Action:** Admin klik [Eye Icon].
- **Backend API:** `POST /admin/users/reveal-password`
  1. Cek session: Apakah role == 'admin'?
  2. Ambil `password_encrypted_viewable` dari DB berdasarkan ID.
  3. Panggil `cryptoHelper.decrypt(ciphertext)`.
  4. Return JSON: `{ plain_password: "kucing123" }`.
- **Frontend:** Ganti bintang-bintang dengan teks password asli via JavaScript.

#### B. Create/Add User

- **Form Input:** Username Web, Password Web, NIP (Comment ID).
- **Backend Process:**
  1. `hash = bcrypt.hash(password)`
  2. `encrypted = cryptoHelper.encrypt(password)`
  3. `INSERT INTO users (..., password_hash, password_encrypted_viewable, ...)`

### 3. Sync Database

- **Action:** Tombol "Sync from Mikrotik".
- **Logic:**
  1. Get all hotspot users from Mikrotik.
  2. Cocokkan `comment` di Mikrotik dengan `mikrotik_comment_id` di DB lokal.
  3. Update info status di dashboard (agar data tidak stale).

---

## User Flow: Guru

### 1. Dashboard Self-Service

- **Logic:**
  1. Ambil `mikrotik_comment_id` dari session user yang login.
  2. Panggil `mikrotikService.getUserByComment(comment_id)`.
  3. Jika user tidak ditemukan di Mikrotik (terhapus admin jaringan), tampilkan pesan error yang sopan.

### 2. Update Hotspot Password

- **Action:** Guru input password baru → Submit.
- **Backend Process:**
  1. Cari `.id` (Internal ID Mikrotik) berdasarkan Comment ID.
  2. `mikrotikService.updateUserPassword(internal_id, new_password)`.
  3. **Auto-Kick:** Panggil `mikrotikService.removeActiveUser(username)` agar HP guru terputus dan meminta login ulang dengan password baru.

---

## Mikrotik Integration Strategy

### 1. On-Demand Connection (Best Practice)

Jangan membuka koneksi terus menerus.

```javascript
// Pseudo-code pattern for Services
async function executeMikrotikCommand(callback) {
  // 1. Get encrypted creds from DB
  const settings = db.getSettings();
  // 2. Decrypt password
  const realPass = decrypt(settings.router_password_encrypted);

  // 3. Connect
  const client = new RouterOSClient({ ... });
  await client.connect();

  try {
    // 4. Execute
    return await callback(client);
  } finally {
    // 5. Always close
    client.close();
  }
}
```

### 2. Identifier Consistency

- Selalu gunakan **Comment** sebagai _Foreign Key_.
- Jangan pernah menggunakan **Name** (Username) sebagai identifier untuk operasi Update, karena Username bisa diubah oleh guru kapan saja.

---

**End of Workflow Document**

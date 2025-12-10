# Mikrotik Hotspot Management System

Aplikasi web manajemen Hotspot Mikrotik dengan arsitektur **MVC (Model-View-Controller)** yang profesional.

## 🏗️ Arsitektur

Aplikasi ini menggunakan struktur **MVC** dengan:

- **Models**: Database operations (User, Settings)
- **Views**: EJS templates dengan Bootstrap 5
- **Controllers**: Business logic (Admin, Guru, Auth)
- **Services**: External API integration (Mikrotik)
- **Middlewares**: Authentication & Authorization

## ✨ Fitur

### Admin Panel

- ✅ Dashboard dengan status koneksi Mikrotik
- ✅ Router Configuration (via environment variables)
- ✅ User Management (CRUD akun guru)
- ✅ Total guru counter

### Guru Panel

- ✅ Dashboard dengan info hotspot user
- ✅ Update username & password hotspot
- ✅ Reset koneksi aktif (kick session)
- ✅ Status koneksi real-time

## 🚀 Instalasi

1. **Install dependencies:**

```bash
npm install
```

2. **Setup database:**

```bash
npm run setup-db
```

3. **Buat file `.env`:**

```env
SESSION_SECRET=your-secret-key-change-this-in-production
PORT=3000
NODE_ENV=development
```

4. **Jalankan server:**

```bash
npm start
```

5. **Akses aplikasi:**

- URL: `http://localhost:3000`
- Admin: `admin` / `admin123`
- **PENTING**: Ganti password admin setelah login pertama!

## 📋 Default Credentials

Setelah menjalankan `npm run setup-db`:

- **Username**: `admin`
- **Password**: `admin123`
- **Role**: `admin`

## 🔧 Konfigurasi Router

Router configuration disimpan di **environment variables** (`.env` file) untuk keandalan maksimal.

1. Generate encrypted password:
```bash
node scripts/setup-router-env.js your_router_password
```

2. Tambahkan ke file `.env`:
```env
ROUTER_IP=192.168.88.1
ROUTER_PORT=8728
ROUTER_USER=admin
ROUTER_PASSWORD_ENCRYPTED=encrypted_hex_string_here
```

**Catatan**: Router config **HARUS** di-set di `.env` file, bukan via web UI!

## 📁 Struktur Database

### Tabel `users`

- `id` - Primary key
- `username` - Username untuk login web
- `password_hash` - Hash password (bcrypt)
- `role` - 'admin' atau 'guru'
- `mikrotik_comment_id` - Comment ID di Mikrotik (anchor)
- `created_at` - Timestamp

### Tabel `settings`

- `id` - Primary key (always 1)
- `hotspot_dns_name` - DNS name untuk hotspot
- `telegram_bot_token` - Token bot Telegram (opsional)
- `telegram_chat_id` - Chat ID Telegram (opsional)
- `school_name` - Nama sekolah

**Catatan**: Router config (IP, port, username, password) sekarang disimpan di **environment variables** (`.env`), bukan di database.

## 🔐 Security Features

- ✅ Password hashing dengan bcrypt
- ✅ Session management dengan express-session
- ✅ Role-based access control (Admin/Guru)
- ✅ Middleware protection untuk routes
- ✅ Error handling yang aman

## 🛠️ Teknologi

- **Backend**: Node.js + Express.js
- **Database**: SQLite3 (better-sqlite3)
- **View Engine**: EJS
- **UI Framework**: Bootstrap 5
- **Mikrotik API**: node-routeros-v2
- **Security**: bcrypt, express-session

## 📝 Workflow

### Admin Workflow

1. Setup router config di `.env` file (lihat bagian Konfigurasi Router)
2. Login sebagai admin
3. Tambah user guru dengan Comment ID
4. Monitor dashboard untuk status koneksi

### Guru Workflow

1. Login dengan akun guru
2. Lihat info hotspot user di dashboard
3. Update password hotspot jika perlu
4. Reset koneksi jika diperlukan

## ⚠️ Catatan Penting

1. **Router Configuration**: Harus dikonfigurasi di `.env` file sebelum menggunakan fitur Mikrotik (lihat bagian Konfigurasi Router)
2. **Mikrotik Comment ID**: Harus sama persis dengan Comment di user hotspot Mikrotik
3. **Error Handling**: Jika koneksi Mikrotik gagal, periksa konfigurasi di `.env` file
4. **Password Admin**: Ganti password default setelah setup!

## 🐛 Troubleshooting

### Error: "Gagal terhubung ke Mikrotik"

- Periksa konfigurasi router di `.env` file (ROUTER_IP, ROUTER_PORT, ROUTER_USER, ROUTER_PASSWORD_ENCRYPTED)
- Pastikan IP, port, username, dan password benar
- Pastikan API service aktif di Mikrotik
- Restart aplikasi setelah mengubah `.env` file

### Error: "User hotspot tidak ditemukan"

- Pastikan Comment ID di database sama dengan Comment di Mikrotik
- Pastikan user hotspot sudah dibuat di Mikrotik

### Error: "Username sudah digunakan"

- Username hotspot harus unik
- Pastikan username baru tidak digunakan user lain

## 📄 License

ISC

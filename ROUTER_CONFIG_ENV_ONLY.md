# Router Configuration: Environment Variables Only

## 🎯 Overview

**Router configuration (IP, username, password) sekarang HANYA diambil dari environment variables (`.env` file).**

Tidak ada lagi penyimpanan router config di:
- ❌ Database SQLite (tabel `settings`)
- ❌ JSON File (`router-config.json`)

**Hanya Environment Variables:**
- ✅ `.env` file (recommended)
- ✅ PM2 ecosystem config
- ✅ Systemd environment variables

## 📋 Environment Variables Required

```env
ROUTER_IP=192.168.88.1
ROUTER_PORT=8728
ROUTER_USER=admin
ROUTER_PASSWORD_ENCRYPTED=encrypted_hex_string_here
```

### Generate Encrypted Password

```bash
node scripts/setup-router-env.js your_router_password
```

Copy encrypted value ke `.env` file.

## 🔄 Migration dari Database/JSON

Jika sebelumnya router config ada di database atau JSON file:

1. **Cek nilai saat ini:**
   ```bash
   # Jika ada di database
   sqlite3 hotspot.db "SELECT router_ip, router_port, router_user FROM settings WHERE id = 1;"
   
   # Jika ada di JSON file
   cat router-config.json
   ```

2. **Generate encrypted password:**
   ```bash
   node scripts/setup-router-env.js your_password
   ```

3. **Edit `.env` file:**
   ```env
   ROUTER_IP=192.168.88.1
   ROUTER_PORT=8728
   ROUTER_USER=admin
   ROUTER_PASSWORD_ENCRYPTED=encrypted_value_here
   ```

4. **Restart aplikasi:**
   ```bash
   pm2 restart smansada-hotspot
   ```

## ⚠️ Important Changes

### 1. Web UI Tidak Bisa Update Router Config

**Sebelumnya:**
- Admin bisa update router config via `/admin/settings` page
- Data disimpan ke database

**Sekarang:**
- Router config **TIDAK BISA** diubah via web UI
- Jika user mencoba update via web UI, akan muncul warning
- Router config **HARUS** diubah via `.env` file dan restart aplikasi

### 2. Database Schema

**Sebelumnya:**
- Tabel `settings` memiliki kolom: `router_ip`, `router_port`, `router_user`, `router_password_encrypted`

**Sekarang:**
- Kolom router config **TIDAK DIBUAT** lagi di database baru
- Kolom lama tetap ada (untuk backward compatibility), tapi **TIDAK DIGUNAKAN**
- Tabel `settings` hanya untuk: `hotspot_dns_name`, `telegram_bot_token`, `telegram_chat_id`, `school_name`

### 3. Code Changes

**Files Updated:**
- `utils/routerConfigStorage.js` - Hanya baca dari env vars (hapus fallback ke file/database)
- `models/Settings.js` - Tidak lagi save router config ke database
- `controllers/adminController.js` - Tidak lagi handle router config update
- `setup_db.js` - Tidak lagi membuat kolom router config

## ✅ Benefits

1. **Maximum Reliability** - Environment variables tidak bisa hilang setelah reboot
2. **No File System Issues** - Tidak terpengaruh permission atau I/O errors
3. **Simplified Code** - Tidak perlu multi-layer storage logic
4. **Clear Separation** - Router config terpisah dari application settings

## 🐛 Troubleshooting

### Masalah: Router config tidak terbaca

**Cek:**
```bash
# Cek apakah .env file ada
ls -la .env

# Cek apakah env vars terbaca
pm2 env smansada-hotspot | grep ROUTER

# Cek log aplikasi
pm2 logs smansada-hotspot | grep RouterConfigStorage
```

**Solusi:**
1. Pastikan `.env` file ada di root project
2. Pastikan `dotenv` sudah di-load di `app.js` (sudah ada)
3. Restart aplikasi: `pm2 restart smansada-hotspot`

### Masalah: Web UI masih menampilkan form router config

**Ini normal!** Form masih ada untuk display purposes, tapi:
- Update via form akan muncul warning
- Router config harus diubah via `.env` file

### Masalah: Kolom router config masih ada di database

**Ini normal!** Kolom lama tetap ada untuk backward compatibility, tapi:
- Kolom **TIDAK DIGUNAKAN** lagi
- Kolom baru **TIDAK AKAN DIBUAT** lagi
- Data di kolom lama **TIDAK DIBACA** lagi

## 📚 Related Documentation

- `SETUP_ROUTER_ENV.md` - Setup guide untuk environment variables
- `ENV_FILE_FORMAT.md` - Format .env file yang benar
- `ROUTER_CONFIG_STORAGE_HISTORY.md` - Sejarah evolusi storage method

---

**Last Updated**: 2025-01-02  
**Version**: 3.0 (Environment Variables Only)


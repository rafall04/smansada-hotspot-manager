# Sejarah Penyimpanan Router Configuration

## 📜 Timeline Evolusi Storage Method

### Versi Awal (Original Implementation)

**Storage:** Database SQLite (tabel `settings`)

```sql
CREATE TABLE settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  router_ip TEXT NOT NULL DEFAULT '192.168.88.1',
  router_port INTEGER NOT NULL DEFAULT 8728,
  router_user TEXT NOT NULL DEFAULT 'admin',
  router_password_encrypted TEXT NOT NULL DEFAULT '',
  ...
)
```

**Cara kerja:**
- Admin login → Settings page → Input router IP, username, password
- Data disimpan ke database SQLite (`hotspot.db`)
- Password di-encrypt dengan AES-256-CBC sebelum disimpan

**Dokumentasi asli:**
- `README.md` line 83: "**Catatan**: Konfigurasi disimpan di database, bukan di `.env`!"

**Masalah yang muncul:**
- ❌ Password hilang setelah reboot Ubuntu
- ❌ Data tidak ter-persist ke disk dengan benar
- ❌ SQLite I/O errors (`SQLITE_IOERR_DELETE_NOENT`)

---

### Versi 2: JSON File Storage

**Storage:** File JSON (`router-config.json`)

**Alasan perubahan:**
- Database SQLite tidak reliable untuk critical config
- File-based storage lebih mudah di-debug
- Atomic write dengan fsync untuk durability

**Cara kerja:**
- Router config disimpan di `router-config.json`
- Settings lain (telegram, school_name) tetap di database
- Auto-backup sebelum write

**Masalah yang masih muncul:**
- ❌ Masih hilang setelah reboot (meskipun sudah pakai fsync)
- ❌ File system issues di Ubuntu

**Dokumentasi:** `ROUTER_CONFIG_JSON.md`

---

### Versi 3: Environment Variables (Current - PRIMARY)

**Storage:** Environment Variables (`.env` file atau PM2/systemd)

**Alasan perubahan:**
- Environment variables paling reliable
- Tidak terpengaruh file system issues
- Tidak terpengaruh permission issues
- Survive reboot jika di-set di PM2/systemd

**Cara kerja:**
- **PRIMARY:** Environment Variables (`.env` atau PM2 config)
- **FALLBACK 1:** JSON File (`router-config.json`)
- **FALLBACK 2:** Database (untuk migration)

**Format:**
```env
ROUTER_IP=192.168.88.1
ROUTER_PORT=8728
ROUTER_USER=admin
ROUTER_PASSWORD_ENCRYPTED=encrypted_hex_string
```

**Dokumentasi:** 
- `SETUP_ROUTER_ENV.md`
- `ROUTER_CONFIG_STORAGE_SOLUTION.md`

---

## 🔄 Migration Path

### Dari Database → JSON → Environment Variables

Sistem otomatis melakukan migration:

1. **Baca dari Environment Variables** (jika ada) → Gunakan langsung
2. **Jika tidak ada**, baca dari JSON File
3. **Jika tidak ada**, baca dari Database (untuk backward compatibility)
4. **Jika tidak ada**, gunakan defaults

### Saat Update Settings

- Jika **env vars sudah di-set**: Save ke file/database sebagai backup (env vars tetap digunakan)
- Jika **env vars tidak di-set**: Save ke file dan database (normal operation)

---

## 📋 Summary

| Versi | Storage Method | Masalah | Status |
|-------|---------------|---------|--------|
| **1.0** | Database SQLite | ❌ Data hilang setelah reboot | Deprecated |
| **2.0** | JSON File | ❌ Masih hilang setelah reboot | Fallback |
| **3.0** | Environment Variables | ✅ Most Reliable | **PRIMARY** |

---

## ❓ FAQ

### Q: Bukankah dari awal sudah di .env?

**A:** Tidak. Dari awal router config disimpan di **database SQLite**, bukan di `.env`.

**Bukti:**
- `README.md` line 83: "Konfigurasi disimpan di database, bukan di `.env`!"
- `setup_db.js` membuat tabel `settings` dengan kolom `router_ip`, `router_user`, `router_password_encrypted`
- `REBOOT_DATA_LOSS_FIX.md` menjelaskan masalah data hilang dari database

**Kenapa sekarang pakai .env?**
- Karena database tidak reliable untuk critical config (data hilang setelah reboot)
- Environment variables lebih reliable dan survive reboot

### Q: Apakah data lama di database masih bisa digunakan?

**A:** Ya! Sistem otomatis membaca dari database sebagai fallback jika env vars dan JSON file tidak ada.

**Flow:**
1. Cek Environment Variables → Jika ada, gunakan
2. Cek JSON File → Jika ada, gunakan
3. Cek Database → Jika ada, gunakan + auto-migrate ke file
4. Defaults → Jika semua tidak ada

### Q: Bagaimana cara migrate dari database ke .env?

**A:** Tidak perlu manual migration. Sistem otomatis:
1. Baca dari database (jika env vars tidak ada)
2. Auto-migrate ke JSON file
3. Anda bisa copy ke `.env` untuk membuat PRIMARY storage

**Atau manual:**
```bash
# 1. Cek data di database
sqlite3 hotspot.db "SELECT router_ip, router_port, router_user FROM settings WHERE id = 1;"

# 2. Generate encrypted password
node scripts/setup-router-env.js your_password

# 3. Edit .env dan tambahkan:
ROUTER_IP=192.168.88.1
ROUTER_PORT=8728
ROUTER_USER=admin
ROUTER_PASSWORD_ENCRYPTED=encrypted_value_here

# 4. Restart aplikasi
pm2 restart smansada-hotspot
```

---

## 📚 Referensi

- `REBOOT_DATA_LOSS_FIX.md` - Masalah data hilang dari database
- `ROUTER_CONFIG_JSON.md` - Solusi JSON file storage
- `ROUTER_CONFIG_STORAGE_SOLUTION.md` - Solusi multi-layer storage
- `SETUP_ROUTER_ENV.md` - Setup environment variables
- `README.md` - Dokumentasi original (menyebutkan database storage)

---

**Last Updated**: 2025-01-02


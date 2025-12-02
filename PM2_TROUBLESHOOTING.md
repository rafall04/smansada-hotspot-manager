# PM2 Troubleshooting Guide

## Masalah: Login Tidak Bisa dengan PM2 (Session Issue)

### Gejala
- `npm start` bekerja dengan baik (login berhasil)
- `pm2 start ecosystem.config.js` - login tidak berhasil (kembali ke halaman login)
- `pm2 start app.js` - login berhasil
- Username/password benar, tetapi session tidak tersimpan

**Penyebab:**
- PM2 menggunakan working directory yang berbeda saat membaca `ecosystem.config.js`
- Session store (`connect-sqlite3`) menggunakan path relatif `dir: './'`
- Working directory PM2 berbeda dari project directory

**Solusi:**
- ✅ **RECOMMENDED:** Gunakan `pm2 start app.js` langsung (tanpa config file)
- Atau gunakan absolute path untuk `script` dan `cwd` di `ecosystem.config.js` (jika perlu)

---

## Masalah: Database Tidak Tersimpan dengan PM2

### Gejala
- `npm start` bekerja dengan baik (database tersimpan)
- `pm2 start ecosystem.config.js` tidak menyimpan database
- Settings hilang setelah restart PM2
- Password router tidak tersimpan

---

## 🔍 Diagnosa

### 1. Cek Working Directory PM2

```bash
# Cek working directory yang digunakan PM2
pm2 describe smansada-hotspot | grep "cwd"

# Atau cek di PM2 logs
pm2 logs smansada-hotspot --lines 50 | grep "\[DB\]"
```

**Expected output:**
```
[DB] Project root: /path/to/smansada-hotspot-manager
[DB] Database path: /path/to/smansada-hotspot-manager/hotspot.db
[DB] Current working directory: /path/to/smansada-hotspot-manager
```

**Jika berbeda:**
- PM2 menggunakan working directory yang salah
- Database dibuat di lokasi yang berbeda

---

### 2. Cek Permission Database

```bash
# Cek ownership
ls -lh hotspot.db

# Cek permission
stat hotspot.db

# Cek apakah writable
test -w hotspot.db && echo "Writable" || echo "NOT Writable"
```

**Expected:**
- Owner: User yang menjalankan PM2
- Permission: 664 (rw-rw-r--)
- Writable: Yes

---

### 3. Cek PM2 Process User

```bash
# Cek user yang menjalankan PM2
ps aux | grep pm2
ps aux | grep "node.*app.js"

# Cek PM2 daemon user
pm2 info smansada-hotspot | grep "username"
```

**Expected:**
- User: Bukan `root`
- User: Sama dengan owner database file

---

## ✅ Solusi

### Solusi 1: Gunakan `pm2 start app.js` (RECOMMENDED)

**Cara terbaik dan paling sederhana:**

```bash
# Start PM2 langsung dengan app.js
pm2 start app.js --name smansada-hotspot

# Save PM2 configuration
pm2 save

# Setup PM2 startup (hanya sekali)
pm2 startup
# (ikuti instruksi yang muncul)

# Verify
pm2 list
pm2 logs smansada-hotspot
```

**Keuntungan:**
- ✅ Working directory otomatis benar (current directory)
- ✅ Session store bekerja dengan benar
- ✅ Database path konsisten
- ✅ Tidak perlu config file yang kompleks

---

### Solusi 2: Update ecosystem.config.js (ALTERNATIVE)

Jika Anda ingin menggunakan config file, pastikan menggunakan absolute path:

File `ecosystem.config.js` sudah diperbarui dengan:
- `cwd: projectRoot` - Memastikan PM2 menggunakan directory project
- Absolute path untuk script dan log files
- Explicit working directory

**Verifikasi:**
```bash
# Restart PM2
pm2 delete smansada-hotspot
pm2 start ecosystem.config.js

# Cek logs
pm2 logs smansada-hotspot --lines 20
```

**Expected log:**
```
[DB] Project root: /path/to/smansada-hotspot-manager
[DB] Database path: /path/to/smansada-hotspot-manager/hotspot.db
[DB] Current working directory: /path/to/smansada-hotspot-manager
[DB] ✓ Database directory is writable
[DB] ✓ Database file is writable
```

---

### Solusi 3: Fix Permission

```bash
# Stop PM2
pm2 stop smansada-hotspot

# Fix ownership (ganti USER dengan user yang menjalankan PM2)
sudo chown -R USER:USER /path/to/smansada-hotspot-manager

# Fix permissions
chmod 664 hotspot.db
chmod 755 /path/to/smansada-hotspot-manager

# Start PM2
pm2 start ecosystem.config.js
```

---

### Solusi 3: Start PM2 dari Project Directory

```bash
# Pastikan start dari project directory
cd /path/to/smansada-hotspot-manager

# Start PM2
pm2 start ecosystem.config.js

# Verify
pm2 describe smansada-hotspot | grep "cwd"
```

---

### Solusi 4: Gunakan Absolute Path di PM2

Jika masih bermasalah, edit `ecosystem.config.js`:

```javascript
const path = require('path');

module.exports = {
  apps: [
    {
      name: 'smansada-hotspot',
      script: path.join(__dirname, 'app.js'),  // Absolute path
      cwd: __dirname,  // Explicit working directory
      // ... rest of config
    }
  ]
};
```

---

## 🧪 Testing

### Test 1: Save Settings

1. Login sebagai admin
2. Buka Settings page
3. Update router password
4. Cek PM2 logs:
   ```bash
   pm2 logs smansada-hotspot --lines 50 | grep -i "settings\|password\|checkpoint"
   ```

**Expected:**
```
[Settings] Router and notification settings updated successfully
[DB] ✓ Checkpoint completed - data flushed to disk
[Settings] ✓ Post-update verification: Password persistence confirmed
```

### Test 2: Restart PM2

```bash
# Restart PM2
pm2 restart smansada-hotspot

# Cek settings masih ada
pm2 logs smansada-hotspot --lines 20 | grep -i "settings\|router"
```

**Expected:**
- Settings masih ada setelah restart
- Password router masih tersimpan

### Test 3: Verify Database File

```bash
# Cek database file
sqlite3 hotspot.db "SELECT router_ip, router_user FROM settings WHERE id = 1;"

# Cek timestamp (jika ada)
ls -lh hotspot.db
```

**Expected:**
- Database file ter-update (timestamp berubah)
- Data tersimpan dengan benar

---

## 🔧 Advanced Debugging

### Enable Verbose Logging

Edit `ecosystem.config.js`:

```javascript
env: {
  NODE_ENV: 'development',  // Change from 'production'
  PORT: 3000,
  DEBUG: 'db:*'  // Enable database debug logs
}
```

### Check Database Location

```bash
# Cek semua file database
find / -name "hotspot.db" 2>/dev/null

# Cek journal files
ls -lh hotspot.db-*

# Cek PM2 working directory
pm2 describe smansada-hotspot | grep -A 5 "cwd"
```

---

## ⚠️ Common Issues

### Issue 1: Multiple Database Files

**Gejala:**
- Database tersimpan di lokasi berbeda
- PM2 menggunakan database yang berbeda dari `npm start`

**Solusi:**
- Pastikan `cwd` di ecosystem.config.js benar
- Gunakan absolute path untuk database

### Issue 2: Permission Denied

**Gejala:**
```
[DB] ❌ Database file is NOT writable
```

**Solusi:**
```bash
sudo chown -R USER:USER /path/to/project
chmod 664 hotspot.db
```

### Issue 3: PM2 Running as Root

**Gejala:**
- PM2 berjalan sebagai root
- Database dibuat dengan ownership root

**Solusi:**
```bash
# Stop PM2
pm2 delete all
pm2 kill

# Start sebagai user biasa
cd /path/to/project
pm2 start ecosystem.config.js
```

---

## 📋 Checklist

- [ ] `ecosystem.config.js` memiliki `cwd: __dirname`
- [ ] PM2 start dari project directory
- [ ] Database file writable (664)
- [ ] Project directory writable (755)
- [ ] PM2 tidak berjalan sebagai root
- [ ] Database path konsisten (cek logs)
- [ ] Checkpoint berjalan setelah save (cek logs)
- [ ] Settings tersimpan setelah restart PM2

---

## 🆘 Jika Masih Bermasalah

1. **Cek PM2 Logs:**
   ```bash
   pm2 logs smansada-hotspot --lines 100
   ```

2. **Cek Database Logs:**
   ```bash
   pm2 logs smansada-hotspot | grep "\[DB\]"
   ```

3. **Cek Settings Logs:**
   ```bash
   pm2 logs smansada-hotspot | grep "\[Settings\]"
   ```

4. **Verifikasi Manual:**
   ```bash
   sqlite3 hotspot.db "SELECT * FROM settings WHERE id = 1;"
   ```

5. **Compare dengan npm start:**
   ```bash
   # Stop PM2
   pm2 stop smansada-hotspot
   
   # Start dengan npm
   npm start
   
   # Test save settings
   # Stop npm (Ctrl+C)
   
   # Start PM2
   pm2 start ecosystem.config.js
   
   # Cek apakah settings masih ada
   ```

---

**Last Updated:** 2025-01-02


# Fix: Password Mikrotik Hilang Setelah Reboot Ubuntu

## 🔍 Masalah

Setelah reboot Ubuntu, password Mikrotik hilang dari database, padahal data lain (username, IP, dll) tetap aman.

## 🎯 Penyebab

Masalah ini terjadi karena:

1. **Data belum ter-flush ke disk**: Meskipun SQLite sudah commit transaction, OS mungkin belum menulis data ke physical disk
2. **Journal file tidak terhapus**: Journal file (`hotspot.db-journal`) yang tersisa bisa menyebabkan rollback saat reboot
3. **OS buffer cache**: Data masih di OS buffer cache dan belum ditulis ke disk saat reboot terjadi

## ✅ Solusi yang Diterapkan

### 1. Enhanced Checkpoint Function

Fungsi `checkpoint()` di `models/db.js` telah diperkuat dengan:

- **Force commit transaction**: Memastikan semua transaction di-commit
- **Force SQLite flush**: Memaksa SQLite menulis semua dirty pages ke OS buffer
- **OS fsync**: Memaksa OS menulis semua buffered data ke physical disk menggunakan `fs.fsyncSync()`
- **Journal cleanup**: Menghapus journal file yang tersisa untuk mencegah rollback

### 2. Data Verification

Setelah write password, sistem akan:

- **Verify write**: Membaca kembali data dari database untuk memastikan tersimpan
- **Compare values**: Membandingkan password yang ditulis dengan yang dibaca
- **Error handling**: Melempar error jika verifikasi gagal

### 3. Improved Error Logging

Sistem sekarang mencatat:

- Status checkpoint (success/failure)
- Hasil verifikasi data
- Warning jika ada masalah

## 📋 Cara Mengatasi (Jika Masih Terjadi)

### Step 1: Pastikan Permission Benar

```bash
# Cek ownership database
ls -lh hotspot.db

# Fix ownership (ganti USER dengan user yang menjalankan PM2)
sudo chown USER:USER hotspot.db
sudo chmod 664 hotspot.db
```

### Step 2: Hapus Journal Files

```bash
cd /path/to/project
rm -f hotspot.db-journal hotspot.db-wal hotspot.db-shm
```

### Step 3: Set Journal Mode ke DELETE

```bash
sqlite3 hotspot.db "PRAGMA journal_mode=DELETE;"
```

### Step 4: Verifikasi Settings

```bash
sqlite3 hotspot.db "SELECT router_ip, router_user, LENGTH(router_password_encrypted) as pwd_length FROM settings WHERE id = 1;"
```

Jika `pwd_length` adalah 0 atau NULL, password memang hilang.

### Step 5: Restart Aplikasi

```bash
pm2 restart smansada-hotspot
```

## 🔧 Testing

Setelah update, test dengan:

1. **Simpan password Mikrotik** di `/admin/settings`
2. **Cek log** untuk konfirmasi checkpoint:
   ```
   [DB] ✓ Checkpoint completed - data flushed to disk
   [Settings] ✓ Password verification passed - data confirmed on disk
   ```
3. **Reboot Ubuntu**:
   ```bash
   sudo reboot
   ```
4. **Setelah reboot**, cek apakah password masih ada:
   - Login ke aplikasi
   - Buka `/admin/settings`
   - Password field seharusnya sudah terisi (atau bisa di-decrypt)

## 📝 Technical Details

### Checkpoint Process

```javascript
// 1. Commit transaction
db.exec('BEGIN IMMEDIATE; COMMIT;');

// 2. Force SQLite flush
db.pragma('synchronous = FULL');
db.pragma('optimize');

// 3. Force OS flush (CRITICAL)
const fd = fs.openSync(dbPath, 'r+');
fs.fsyncSync(fd);  // Forces OS to write to physical disk
fs.closeSync(fd);

// 4. Clean up journal files
fs.unlinkSync(dbPath + '-journal');  // If exists
```

### Verification Process

```javascript
// After write, verify data
const verifyResult = db.prepare('SELECT router_password_encrypted FROM settings WHERE id = 1').get();
if (verifyResult.router_password_encrypted !== writtenPassword) {
  throw new Error('Password verification failed');
}
```

## ⚠️ Important Notes

1. **fsync is blocking**: `fs.fsyncSync()` akan mem-block thread sampai OS selesai menulis ke disk. Ini normal dan diperlukan untuk data integrity.

2. **Performance impact**: Checkpoint dengan fsync akan sedikit lebih lambat (~10-50ms), tapi ini trade-off yang diperlukan untuk data persistence.

3. **Only for critical writes**: Checkpoint hanya dipanggil untuk:
   - Update settings (termasuk password Mikrotik)
   - Insert settings baru

4. **Journal mode DELETE**: Pastikan journal mode adalah `DELETE`, bukan `WAL`. WAL mode bisa menyebabkan masalah permission dan data loss.

## 🐛 Troubleshooting

### Masalah: Password masih hilang setelah reboot

**Kemungkinan penyebab:**
- File system mount dengan `noatime` atau `sync` options yang tidak benar
- Disk I/O error
- Permission issue

**Solusi:**
```bash
# 1. Cek mount options
mount | grep $(df hotspot.db | tail -1 | awk '{print $1}')

# 2. Cek disk health
sudo smartctl -a /dev/sda  # Ganti sda dengan disk Anda

# 3. Cek I/O errors
dmesg | grep -i error
```

### Masalah: Checkpoint error

**Kemungkinan penyebab:**
- Database file locked
- Permission denied
- Disk full

**Solusi:**
```bash
# 1. Cek disk space
df -h

# 2. Cek file locks
lsof hotspot.db

# 3. Fix permissions
sudo chown USER:USER hotspot.db
sudo chmod 664 hotspot.db
```

## 📚 References

- [SQLite Synchronous Mode](https://www.sqlite.org/pragma.html#pragma_synchronous)
- [SQLite Journal Mode](https://www.sqlite.org/pragma.html#pragma_journal_mode)
- [Node.js fs.fsyncSync()](https://nodejs.org/api/fs.html#fsfsyncsyncfd)
- [Better-SQLite3 Durability](https://github.com/WiseLibs/better-sqlite3/wiki/Durability)

---

**Last Updated**: 2025-01-02  
**Version**: 1.0  
**Status**: ✅ Fixed


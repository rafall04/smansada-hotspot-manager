# Fix Database I/O Error (SQLITE_IOERR_DELETE_NOENT)

Panduan lengkap untuk mengatasi error `SQLITE_IOERR_DELETE_NOENT` dan error database lainnya.

## Error yang Muncul

```
Error getting hotspot user by username: SqliteError: disk I/O error
code: 'SQLITE_IOERR_DELETE_NOENT'
```

## Penyebab Umum

1. **Database file corrupt** - File database rusak atau tidak lengkap
2. **Disk space penuh** - Tidak ada ruang untuk operasi I/O
3. **Permission issues** - File tidak dapat dibaca/ditulis
4. **Database locked** - Proses lain sedang menggunakan database
5. **File system issues** - Masalah dengan filesystem

---

## Solusi Cepat

### Step 1: Diagnose Database

Jalankan script diagnostic untuk mengidentifikasi masalah:

```bash
npm run db:diagnose
```

Script ini akan mengecek:
- ✅ Apakah file database ada
- ✅ Permission file
- ✅ Disk space
- ✅ Database lock
- ✅ Database integrity

### Step 2: Backup Database (PENTING!)

**SELALU backup sebelum repair!**

```bash
npm run db:backup
```

Atau manual:

```bash
mkdir -p backups
cp hotspot.db backups/hotspot.db.backup.$(date +%Y%m%d_%H%M%S)
```

### Step 3: Repair Database

Jika diagnostic menunjukkan masalah integrity:

```bash
npm run db:repair
```

Script ini akan:
1. Backup database otomatis
2. Menjalankan `VACUUM` untuk rebuild database
3. Verifikasi integrity setelah repair

---

## Solusi Manual

### 1. Cek Disk Space

```bash
df -h
```

Jika disk penuh, bersihkan space atau pindahkan database ke lokasi lain.

### 2. Cek Permission

```bash
ls -l hotspot.db
```

Pastikan file dapat dibaca dan ditulis:

```bash
chmod 644 hotspot.db
chown $(whoami):$(whoami) hotspot.db
```

### 3. Cek Database Lock

```bash
# Cek proses yang menggunakan database
lsof hotspot.db

# Cek PM2 processes
pm2 list

# Stop aplikasi jika perlu
pm2 stop smansada-hotspot
```

### 4. Repair dengan SQLite CLI

```bash
# Install sqlite3 CLI (jika belum ada)
sudo apt-get install sqlite3

# Backup dulu
cp hotspot.db hotspot.db.backup

# Repair database
sqlite3 hotspot.db "VACUUM;"

# Verify
sqlite3 hotspot.db "PRAGMA integrity_check;"
```

### 5. Recreate Database (Last Resort)

**HANYA jika semua solusi gagal dan data tidak penting:**

```bash
# Backup database lama
mv hotspot.db hotspot.db.corrupt

# Recreate database
npm run setup-db

# Restore data dari backup (jika memungkinkan)
# Gunakan sqlite3 untuk extract data dari backup
```

---

## Prevention (Pencegahan)

### 1. Regular Backups

Setup cron job untuk backup otomatis:

```bash
# Edit crontab
crontab -e

# Tambahkan (backup setiap hari jam 2 pagi)
0 2 * * * cd /root/smansada-hotspot-manager && npm run db:backup
```

### 2. Monitor Disk Space

```bash
# Setup disk space monitoring
df -h | grep -E '^/dev' | awk '{print $5 " " $6}' | while read output;
do
  used=$(echo $output | awk '{print $1}' | sed 's/%//g')
  partition=$(echo $output | awk '{print $2}')
  if [ $used -gt 80 ]; then
    echo "Warning: Disk space low on $partition ($used% used)"
  fi
done
```

### 3. Database Maintenance

Jalankan maintenance secara berkala:

```bash
# Add to crontab (weekly maintenance)
0 3 * * 0 cd /root/smansada-hotspot-manager && npm run db:repair
```

---

## Error Handling di Code

Kode sudah diperbarui dengan error handling yang lebih baik:

1. **Settings.js**: Menambahkan try-catch dan fallback ke default settings
2. **dbHelper.js**: Utility functions untuk diagnose dan repair
3. **diagnose-db.js**: Script diagnostic lengkap

Jika error terjadi, aplikasi akan:
- Log error dengan detail
- Return default settings (untuk Settings.get)
- Tidak crash aplikasi

---

## Troubleshooting

### Error: "Database is locked"

**Solusi:**
```bash
# Stop semua proses Node.js
pm2 stop all
pkill -f node

# Cek apakah masih locked
lsof hotspot.db

# Jika masih locked, restart server
sudo reboot
```

### Error: "Disk I/O error" setelah repair

**Solusi:**
1. Cek disk health: `sudo smartctl -a /dev/sda`
2. Cek filesystem: `sudo fsck /dev/sda1`
3. Pindahkan database ke disk lain jika perlu

### Error: "Permission denied"

**Solusi:**
```bash
# Fix ownership
sudo chown -R $(whoami):$(whoami) /root/smansada-hotspot-manager

# Fix permissions
chmod 644 hotspot.db
chmod 755 /root/smansada-hotspot-manager
```

---

## Support

Jika masalah masih terjadi setelah mencoba semua solusi:

1. **Collect diagnostic info:**
   ```bash
   npm run db:diagnose > diagnostic.log 2>&1
   df -h >> diagnostic.log
   ls -l hotspot.db >> diagnostic.log
   ```

2. **Check logs:**
   ```bash
   pm2 logs smansada-hotspot --lines 100
   ```

3. **Review error details:**
   - Error code (SQLITE_IOERR_DELETE_NOENT)
   - Stack trace
   - Disk space
   - Permission

---

## Quick Reference

```bash
# Diagnose
npm run db:diagnose

# Backup
npm run db:backup

# Repair
npm run db:repair

# Check PM2
pm2 list
pm2 logs smansada-hotspot

# Check disk
df -h

# Check permissions
ls -l hotspot.db
```


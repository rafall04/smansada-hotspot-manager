# Database Backup Guide

## 🛡️ Keamanan Database

### Database TIDAK Di-Track oleh Git

**✅ Sudah Dikonfigurasi:**
- `*.db` sudah di `.gitignore` - semua file database di-ignore
- `backups/` sudah di `.gitignore` - folder backup di-ignore
- Database tidak akan pernah ter-commit ke git

**Verifikasi:**
```bash
# Cek apakah database di-ignore
git check-ignore hotspot.db
# Output: hotspot.db (berarti di-ignore ✅)

# Cek apakah database di-track
git ls-files hotspot.db
# Output: (kosong, berarti tidak di-track ✅)
```

---

## 💾 Fitur Backup Database

### 1. Backup Manual

**Menggunakan Script:**
```bash
# Berikan permission (hanya sekali)
chmod +x scripts/backup-database.sh

# Jalankan backup
./scripts/backup-database.sh

# Atau via npm
npm run db:backup
```

**Output:**
```
==========================================
Database Backup Script
==========================================

✓ Backup created successfully

Database: /path/to/hotspot.db
  Size: 72K

Backup: /path/to/backups/hotspot_20251202_140000.db
  Size: 68K

✓ Backup integrity verified
Total backups: 5
```

### 2. Backup Otomatis

**Sebelum Update:**
- Script `update-production.sh` otomatis membuat backup sebelum update
- Backup disimpan di `backups/hotspot_YYYYMMDD_HHMMSS.db`

**Scheduled Backup (Cron):**
```bash
# Edit crontab
crontab -e

# Backup setiap hari jam 2 pagi
0 2 * * * cd /path/to/smansada-hotspot-manager && ./scripts/backup-database.sh >> /var/log/hotspot-backup.log 2>&1

# Backup setiap minggu (Minggu jam 3 pagi)
0 3 * * 0 cd /path/to/smansada-hotspot-manager && ./scripts/backup-database.sh >> /var/log/hotspot-backup.log 2>&1
```

---

## 📋 Fitur Backup Script

### Yang Dilakukan Script:

1. ✅ **Membuat Backup dengan Timestamp**
   - Format: `hotspot_YYYYMMDD_HHMMSS.db`
   - Lokasi: `backups/` directory

2. ✅ **Verifikasi Integrity**
   - Menggunakan `sqlite3 PRAGMA integrity_check`
   - Memastikan backup tidak corrupt

3. ✅ **Auto-Cleanup**
   - Menyimpan 10 backup terbaru
   - Menghapus backup lama otomatis

4. ✅ **Informasi Detail**
   - Ukuran database dan backup
   - Total jumlah backup
   - Lokasi backup file

---

## 🔄 Restore dari Backup

### Cara 1: Restore Manual

```bash
# 1. Stop aplikasi
pm2 stop smansada-hotspot

# 2. List backup yang tersedia
ls -lht backups/

# 3. Restore dari backup
cp backups/hotspot_20251202_140000.db hotspot.db

# 4. Fix permissions
chmod 664 hotspot.db
chown user:user hotspot.db

# 5. Verify database
sqlite3 hotspot.db "PRAGMA integrity_check;"
# Output: ok

# 6. Restart aplikasi
pm2 restart smansada-hotspot
```

### Cara 2: Restore Script (Coming Soon)

```bash
# Restore dari backup terbaru
./scripts/restore-database.sh

# Restore dari backup spesifik
./scripts/restore-database.sh backups/hotspot_20251202_140000.db
```

---

## 🗂️ Manajemen Backup

### List Semua Backup

```bash
# List dengan detail
ls -lht backups/

# List dengan ukuran
du -sh backups/*

# Count backup
ls -1 backups/hotspot_*.db | wc -l
```

### Hapus Backup Lama

```bash
# Hapus backup lebih dari 30 hari
find backups/ -name "hotspot_*.db" -mtime +30 -delete

# Hapus backup lebih dari 100MB total
# (gunakan dengan hati-hati)
```

### Backup ke Lokasi Lain

```bash
# Backup ke external drive
./scripts/backup-database.sh
cp backups/hotspot_*.db /mnt/external-drive/

# Backup ke remote server (scp)
scp backups/hotspot_*.db user@remote-server:/backup-location/
```

---

## ⚠️ Best Practices

### 1. **Backup Regular**

**Recommended Schedule:**
- **Daily:** Backup setiap hari (untuk data penting)
- **Before Update:** Otomatis sebelum update (sudah ada)
- **Before Major Changes:** Manual backup sebelum perubahan besar

### 2. **Verify Backup**

```bash
# Setelah backup, selalu verify
sqlite3 backups/hotspot_YYYYMMDD_HHMMSS.db "PRAGMA integrity_check;"
# Output harus: ok
```

### 3. **Test Restore**

```bash
# Test restore di environment test/staging
# Jangan test langsung di production!
```

### 4. **Multiple Backup Locations**

```bash
# Backup ke multiple locations
./scripts/backup-database.sh
cp backups/hotspot_*.db /backup-location-1/
cp backups/hotspot_*.db /backup-location-2/
```

### 5. **Monitor Backup Size**

```bash
# Cek total size backup
du -sh backups/

# Jika terlalu besar, pertimbangkan cleanup
```

---

## 🔒 Keamanan Backup

### 1. **Permission Backup Files**

```bash
# Set permission untuk backup
chmod 600 backups/hotspot_*.db  # Read/write owner only
chown user:user backups/hotspot_*.db
```

### 2. **Encrypt Backup (Optional)**

```bash
# Encrypt backup sebelum disimpan
gpg --encrypt --recipient your-email@example.com backups/hotspot_YYYYMMDD_HHMMSS.db

# Decrypt saat restore
gpg --decrypt backups/hotspot_YYYYMMDD_HHMMSS.db.gpg > hotspot.db
```

### 3. **Backup Tidak Di-Track Git**

- ✅ `backups/` sudah di `.gitignore`
- ✅ Backup tidak akan ter-commit ke git
- ✅ Backup tetap aman di server

---

## 📊 Monitoring Backup

### Check Backup Status

```bash
# Cek backup terbaru
ls -lht backups/ | head -1

# Cek ukuran total backup
du -sh backups/

# Cek jumlah backup
ls -1 backups/hotspot_*.db | wc -l
```

### Backup Health Check

```bash
# Verify semua backup
for backup in backups/hotspot_*.db; do
    echo "Checking: $backup"
    sqlite3 "$backup" "PRAGMA integrity_check;" | grep -q "ok" && echo "✓ OK" || echo "❌ CORRUPT"
done
```

---

## 🚨 Emergency Recovery

### Jika Database Corrupt

```bash
# 1. Stop aplikasi
pm2 stop smansada-hotspot

# 2. Cari backup terbaru yang sehat
ls -lht backups/

# 3. Verify backup
sqlite3 backups/hotspot_YYYYMMDD_HHMMSS.db "PRAGMA integrity_check;"

# 4. Restore
cp backups/hotspot_YYYYMMDD_HHMMSS.db hotspot.db

# 5. Fix permissions
chmod 664 hotspot.db
chown user:user hotspot.db

# 6. Restart
pm2 restart smansada-hotspot
```

### Jika Semua Backup Corrupt

```bash
# 1. Coba repair database
npm run db:repair

# 2. Jika masih corrupt, restore dari backup terbaru
# 3. Jika masih tidak bisa, hubungi developer
```

---

## 📝 Backup Checklist

Sebelum update production:

- [ ] Backup database dibuat
- [ ] Backup verified (integrity check)
- [ ] Backup size reasonable (tidak 0 bytes)
- [ ] Backup location accessible
- [ ] Multiple backup locations (optional)
- [ ] Test restore procedure (di staging)

---

## 🔗 Related Documentation

- [PRODUCTION_UPDATE_SAFETY.md](./PRODUCTION_UPDATE_SAFETY.md) - Update safety guide
- [DEPLOYMENT_UBUNTU.md](./DEPLOYMENT_UBUNTU.md) - Deployment guide
- [PM2_TROUBLESHOOTING.md](./PM2_TROUBLESHOOTING.md) - PM2 troubleshooting

---

**Last Updated:** 2025-01-02


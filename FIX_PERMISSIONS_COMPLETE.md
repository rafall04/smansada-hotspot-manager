# 🔧 Complete Fix for SQLITE_IOERR_DELETE_NOENT

## Status: Permissions Fixed ✓

Anda sudah menjalankan:
- ✓ `chown -R root:root`
- ✓ `chmod -R 775`
- ✓ `chmod 664 hotspot.db`
- ✓ `npm run setup-db`

Tapi masih error? Kemungkinan masalah:

## ⚠️ Kemungkinan Masalah

### 1. PM2 Masih Berjalan dengan State Lama

**Solusi:**
```bash
# Stop PM2 completely
pm2 stop all
pm2 kill

# Hapus journal files yang mungkin locked
cd /root/smansada-hotspot-manager
rm -f hotspot.db-journal hotspot.db-wal hotspot.db-shm

# Start ulang PM2
pm2 start ecosystem.config.js
pm2 save
```

### 2. Database Journal Mode Issue

SQLite mungkin menggunakan WAL (Write-Ahead Logging) mode yang memerlukan file tambahan.

**Cek journal mode:**
```bash
cd /root/smansada-hotspot-manager
sqlite3 hotspot.db "PRAGMA journal_mode;"
```

**Jika hasilnya WAL, ubah ke DELETE:**
```bash
sqlite3 hotspot.db "PRAGMA journal_mode=DELETE;"
```

### 3. Proses Lain Masih Menggunakan Database

**Cek:**
```bash
# Cek apakah ada proses yang menggunakan database
lsof hotspot.db

# Cek semua proses Node.js
ps aux | grep node

# Kill semua proses Node.js jika perlu (HATI-HATI!)
pkill -f node
```

### 4. SELinux atau AppArmor

**Cek SELinux:**
```bash
getenforce
# Jika Enforcing, coba:
sudo setenforce 0  # Temporary disable
# Test aplikasi
# Jika berhasil, perlu konfigurasi SELinux policy
```

### 5. Disk Space atau Inode

**Cek:**
```bash
df -h
df -i
```

### 6. Filesystem Mount Options

**Cek:**
```bash
mount | grep $(df /root/smansada-hotspot-manager | tail -1 | awk '{print $1}')
```

Jika ada `noexec` atau `nosuid`, itu bisa jadi masalah.

## 🔍 Diagnostic Steps

### Step 1: Cek Error Detail

```bash
# Cek PM2 logs untuk error detail
pm2 logs smansada-hotspot --lines 100 --err

# Atau jika tidak pakai PM2
npm start 2>&1 | tee error.log
```

### Step 2: Test Database Write Manual

```bash
cd /root/smansada-hotspot-manager
sqlite3 hotspot.db "UPDATE settings SET router_ip = '192.168.88.1' WHERE id = 1;"
```

Jika ini gagal, masalahnya di level filesystem, bukan aplikasi.

### Step 3: Cek Journal Files

```bash
ls -la /root/smansada-hotspot-manager/hotspot.db*
```

Jika ada `hotspot.db-journal`, `hotspot.db-wal`, atau `hotspot.db-shm` dengan permissions salah, hapus dan restart.

### Step 4: Test dengan SQLite CLI

```bash
cd /root/smansada-hotspot-manager
sqlite3 hotspot.db <<EOF
PRAGMA journal_mode;
PRAGMA integrity_check;
UPDATE settings SET router_ip = '192.168.88.1' WHERE id = 1;
SELECT router_ip FROM settings WHERE id = 1;
EOF
```

## 🎯 Complete Fix Script

Jalankan script berikut secara berurutan:

```bash
#!/bin/bash
cd /root/smansada-hotspot-manager

echo "Step 1: Stop PM2..."
pm2 stop all
pm2 kill

echo "Step 2: Remove journal files..."
rm -f hotspot.db-journal hotspot.db-wal hotspot.db-shm

echo "Step 3: Fix permissions..."
sudo chown -R root:root /root/smansada-hotspot-manager
sudo chmod -R 775 /root/smansada-hotspot-manager
sudo chmod 664 hotspot.db

echo "Step 4: Set journal mode to DELETE..."
sqlite3 hotspot.db "PRAGMA journal_mode=DELETE;"

echo "Step 5: Verify database..."
sqlite3 hotspot.db "PRAGMA integrity_check;"

echo "Step 6: Test write..."
sqlite3 hotspot.db "UPDATE settings SET router_ip = '192.168.88.1' WHERE id = 1;"

echo "Step 7: Restart PM2..."
pm2 start ecosystem.config.js
pm2 save

echo "Step 8: Check logs..."
sleep 2
pm2 logs smansada-hotspot --lines 20
```

## 📋 Checklist

- [ ] PM2 sudah di-stop dan di-kill
- [ ] Journal files sudah dihapus
- [ ] Permissions sudah benar (775 untuk dir, 664 untuk file)
- [ ] Journal mode sudah di-set ke DELETE
- [ ] Database integrity check passed
- [ ] Manual write test berhasil
- [ ] PM2 sudah di-restart
- [ ] Logs tidak menunjukkan SQLITE_IOERR

## 🆘 Jika Masih Error

1. **Cek error message lengkap** dari PM2 logs
2. **Cek apakah error terjadi saat write atau read**
3. **Cek timestamp error** - apakah terjadi setelah restart atau saat operasi tertentu
4. **Cek apakah error intermittent** atau konsisten

Kirimkan:
- Output `pm2 logs smansada-hotspot --lines 100 --err`
- Output `ls -la /root/smansada-hotspot-manager/hotspot.db*`
- Output `sqlite3 hotspot.db "PRAGMA journal_mode;"`


# Deployment Guide: Ubuntu 20.04

## ⚠️ CRITICAL: Permission Issues

Jika Anda mengalami masalah **"tidak bisa simpan password mikrotik"** atau error permission lainnya, ikuti panduan ini.

---

## 🔍 Diagnosa Masalah

Jalankan script diagnostik untuk mengidentifikasi masalah:

```bash
cd /path/to/smansada-hotspot-manager
chmod +x scripts/diagnose-permissions.sh
./scripts/diagnose-permissions.sh
```

Atau jalankan manual:

```bash
# 1. Cek user yang menjalankan aplikasi
whoami

# 2. Cek lokasi project
pwd

# 3. Cek ownership database
ls -lh hotspot.db

# 4. Cek permission database
stat hotspot.db

# 5. Cek PM2 process
ps aux | grep pm2
ps aux | grep node
```

---

## 🚨 Masalah Umum

### 1. **Aplikasi Berjalan sebagai Root**

**Gejala:**
- Error: `SQLITE_IOERR_DELETE_NOENT`
- Password tidak tersimpan
- Settings hilang setelah restart

**Penyebab:**
- PM2 atau Node.js berjalan sebagai `root` user
- File database dibuat dengan ownership `root`

**Solusi:**
```bash
# 1. Stop PM2
pm2 delete all
pm2 kill

# 2. Buat user khusus (jika belum ada)
sudo useradd -m -s /bin/bash hotspot-manager

# 3. Pindahkan project ke home user (jika di /root/)
sudo mv /root/smansada-hotspot-manager /home/hotspot-manager/

# 4. Fix ownership
sudo chown -R hotspot-manager:hotspot-manager /home/hotspot-manager/smansada-hotspot-manager

# 5. Fix permissions
sudo chmod -R 755 /home/hotspot-manager/smansada-hotspot-manager
sudo chmod 664 /home/hotspot-manager/smansada-hotspot-manager/hotspot.db

# 6. Switch ke user
sudo su - hotspot-manager
cd /home/hotspot-manager/smansada-hotspot-manager

# 7. Start PM2 sebagai user biasa
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

---

### 2. **Project Directory di /root/**

**Gejala:**
- Permission denied saat write database
- File tidak bisa diakses oleh user biasa

**Solusi:**
```bash
# Pindahkan project ke lokasi yang benar
sudo mv /root/smansada-hotspot-manager /home/hotspot-manager/
# atau
sudo mv /root/smansada-hotspot-manager /opt/smansada-hotspot-manager/

# Fix ownership
sudo chown -R hotspot-manager:hotspot-manager /home/hotspot-manager/smansada-hotspot-manager
```

---

### 3. **Database File Permission**

**Gejala:**
- Error: `SQLITE_IOERR`
- Database tidak bisa di-write

**Solusi:**
```bash
# 1. Stop aplikasi
pm2 stop all

# 2. Fix ownership
sudo chown hotspot-manager:hotspot-manager hotspot.db

# 3. Fix permissions
sudo chmod 664 hotspot.db

# 4. Hapus journal files (jika ada)
rm -f hotspot.db-journal hotspot.db-wal hotspot.db-shm

# 5. Set journal mode
sqlite3 hotspot.db "PRAGMA journal_mode=DELETE;"

# 6. Start aplikasi
pm2 start all
```

---

## 🛠️ Solusi Otomatis

Gunakan script perbaikan otomatis:

```bash
cd /path/to/smansada-hotspot-manager
chmod +x scripts/fix-permissions.sh
sudo ./scripts/fix-permissions.sh
```

Script ini akan:
1. ✅ Membuat user khusus (jika belum ada)
2. ✅ Memindahkan project dari `/root/` (jika perlu)
3. ✅ Memperbaiki ownership dan permissions
4. ✅ Membersihkan SQLite journal files
5. ✅ Mengkonfigurasi PM2

---

## 📋 Deployment Steps (Fresh Install)

### 1. **Persiapan Server**

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js (LTS v20)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install build tools (untuk better-sqlite3)
sudo apt install -y build-essential python3

# Install PM2
sudo npm install -g pm2

# Install SQLite3 CLI (optional, untuk debugging)
sudo apt install -y sqlite3
```

### 2. **Setup User & Directory**

```bash
# Buat user khusus
sudo useradd -m -s /bin/bash hotspot-manager

# Buat directory project
sudo mkdir -p /home/hotspot-manager/smansada-hotspot-manager
sudo chown hotspot-manager:hotspot-manager /home/hotspot-manager/smansada-hotspot-manager
```

### 3. **Deploy Application**

```bash
# Switch ke user
sudo su - hotspot-manager

# Clone atau copy project
cd /home/hotspot-manager/smansada-hotspot-manager
# (copy files dari development atau git clone)

# Install dependencies
npm install

# Setup database
npm run setup-db

# Verify database
ls -lh hotspot.db
sqlite3 hotspot.db "SELECT * FROM settings;"
```

### 4. **Configure PM2**

```bash
# Edit ecosystem.config.js jika perlu
nano ecosystem.config.js

# Start dengan PM2
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 startup script
pm2 startup
# (ikuti instruksi yang muncul)

# Verify
pm2 list
pm2 logs
```

### 5. **Verify Permissions**

```bash
# Cek ownership
ls -lh hotspot.db
# Should show: hotspot-manager hotspot-manager

# Cek permissions
stat hotspot.db
# Should show: 664 (rw-rw-r--)

# Test write access
sqlite3 hotspot.db "UPDATE settings SET router_ip='192.168.88.1' WHERE id=1;"
```

---

## 🔧 Troubleshooting

### Error: "Cannot save password"

**Kemungkinan Penyebab:**
1. Database tidak writable
2. Aplikasi berjalan sebagai root
3. Project di `/root/`
4. SQLite journal mode issue

**Solusi:**
```bash
# 1. Cek user
whoami
# Should NOT be "root"

# 2. Cek lokasi
pwd
# Should NOT be in /root/

# 3. Cek database permission
ls -lh hotspot.db
stat hotspot.db

# 4. Fix jika perlu
sudo chown hotspot-manager:hotspot-manager hotspot.db
sudo chmod 664 hotspot.db

# 5. Restart aplikasi
pm2 restart all
```

---

### Error: "SQLITE_IOERR_DELETE_NOENT"

**Solusi:**
```bash
# 1. Stop aplikasi
pm2 stop all

# 2. Hapus journal files
rm -f hotspot.db-journal hotspot.db-wal hotspot.db-shm

# 3. Set journal mode
sqlite3 hotspot.db "PRAGMA journal_mode=DELETE;"

# 4. Fix ownership
sudo chown hotspot-manager:hotspot-manager hotspot.db

# 5. Start aplikasi
pm2 start all
```

---

### Error: "Permission denied"

**Solusi:**
```bash
# Fix ownership seluruh project
sudo chown -R hotspot-manager:hotspot-manager /home/hotspot-manager/smansada-hotspot-manager

# Fix permissions
sudo chmod -R 755 /home/hotspot-manager/smansada-hotspot-manager
sudo chmod 664 /home/hotspot-manager/smansada-hotspot-manager/hotspot.db
```

---

## ✅ Checklist Deployment

- [ ] Node.js LTS v20 terinstall
- [ ] User khusus dibuat (bukan root)
- [ ] Project TIDAK di `/root/`
- [ ] Database file writable (664)
- [ ] Directory writable (755)
- [ ] PM2 berjalan sebagai user biasa
- [ ] SQLite journal mode = DELETE
- [ ] No journal files (wal, shm)
- [ ] Aplikasi bisa save settings

---

## 📚 Referensi

- [CODING_STANDARDS.md](./CODING_STANDARDS.md) - Section "Environmental & Persistence Resilience"
- [WORKFLOW.md](./WORKFLOW.md) - Project workflow documentation

---

## 🆘 Support

Jika masalah masih terjadi setelah mengikuti panduan ini:

1. Jalankan diagnostic script: `./scripts/diagnose-permissions.sh`
2. Cek log aplikasi: `pm2 logs`
3. Cek log sistem: `journalctl -u pm2-*`
4. Verifikasi semua checklist di atas

---

**Last Updated:** 2025-01-02


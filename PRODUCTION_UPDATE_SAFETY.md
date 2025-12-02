# Production Update Safety Guide

## ✅ Apakah Script Update Aman?

**YA, script update sudah aman dengan beberapa lapisan perlindungan:**

---

## 🛡️ Lapisan Perlindungan Database

### 0. **Database TIDAK Di-Track oleh Git (CRITICAL)**

**✅ Sudah Dikonfigurasi:**
- `*.db` sudah di `.gitignore` - semua file database di-ignore
- `backups/` sudah di `.gitignore` - folder backup di-ignore
- Database **TIDAK PERNAH** akan ter-commit ke git

**Verifikasi:**
```bash
# Cek apakah database di-ignore
git check-ignore hotspot.db
# Output: hotspot.db (berarti di-ignore ✅)

# Cek apakah database di-track
git ls-files hotspot.db
# Output: (kosong, berarti tidak di-track ✅)
```

**Mengapa Penting:**
- Database berisi data production yang sensitif
- Database berubah setiap saat (conflict risk jika di-track)
- Database besar (memperlambat git operations)
- Database tidak perlu version control (gunakan backup)

### 1. **Backup Otomatis Sebelum Update**
- ✅ Database di-backup ke `backups/hotspot_YYYYMMDD_HHMMSS.db`
- ✅ Backup dibuat SEBELUM operasi git apapun
- ✅ Ukuran backup diverifikasi

### 2. **Git Ignore Protection**
- ✅ `*.db` sudah di `.gitignore` - database tidak akan ter-commit
- ✅ `backups/` sudah di `.gitignore` - backup tidak akan ter-commit
- ✅ Database tidak akan terhapus oleh `git reset --hard HEAD`

### 3. **Explicit Exclusion di Git Clean**
```bash
git clean -fd --exclude="hotspot.db" --exclude="backups/" ...
```
- ✅ Database dan backup secara eksplisit di-exclude dari `git clean`
- ✅ File-file ini tidak akan terhapus

### 4. **Verifikasi Setelah Pull**
- ✅ Script memverifikasi database masih ada setelah pull
- ✅ Memverifikasi ukuran database (tidak kosong)
- ✅ Auto-restore dari backup jika database hilang

### 5. **Safety Check Git Tracking**
- ✅ Script memverifikasi database tidak di-track oleh git
- ✅ Warning jika database ter-track (seharusnya tidak terjadi)

---

## 📋 Proses Update yang Aman

### Step-by-Step Safety:

1. **Backup Database** ✅
   ```
   ✓ Backup created: backups/hotspot_20251202_133623.db
   ✓ Database size: 72K
   ✓ Backup size: 68K
   ```

2. **Stop Application** ✅
   ```
   ✓ Application stopped
   ```

3. **Reset Changes (Database Aman)** ✅
   ```
   git reset --hard HEAD  # Database tidak terpengaruh (di .gitignore)
   git clean -fd --exclude="hotspot.db" ...  # Database di-exclude
   ```

4. **Pull Updates** ✅
   ```
   git pull origin main  # Database tidak ter-overwrite
   ```

5. **Verify Database** ✅
   ```
   ✓ Database file verified after update (size: 72K)
   ```

6. **Restart Application** ✅
   ```
   ✓ Application restarted
   ```

---

## 🔒 Mengapa Database Aman?

### 1. **Git Ignore**
```gitignore
*.db          # Semua file .db di-ignore
backups/      # Folder backups di-ignore
```

**Artinya:**
- Database tidak pernah di-track oleh git
- `git reset --hard HEAD` tidak akan menghapus file yang tidak di-track
- Database aman dari operasi git

### 2. **Git Reset vs Git Clean**

**`git reset --hard HEAD`:**
- Hanya reset file yang **sudah di-track** oleh git
- File yang tidak di-track (seperti database) **tidak terpengaruh**

**`git clean -fd`:**
- Menghapus file yang **tidak di-track**
- Tapi script sudah exclude database: `--exclude="hotspot.db"`

### 3. **Backup Sebelum Operasi**
- Backup dibuat **SEBELUM** operasi git apapun
- Jika terjadi masalah, bisa restore dari backup

---

## ✅ Checklist Keamanan

Sebelum update, pastikan:

- [x] `.gitignore` berisi `*.db` dan `backups/`
- [x] Database tidak di-track oleh git (`git ls-files hotspot.db` harus kosong)
- [x] Script membuat backup sebelum operasi git
- [x] Script exclude database dari `git clean`
- [x] Script verify database setelah pull
- [x] Script auto-restore dari backup jika database hilang

---

## 🧪 Test Keamanan

### Test 1: Verifikasi Git Ignore

```bash
# Cek apakah database di-ignore
git check-ignore hotspot.db
# Output: hotspot.db (berarti di-ignore ✅)

# Cek apakah database di-track
git ls-files hotspot.db
# Output: (kosong, berarti tidak di-track ✅)
```

### Test 2: Simulasi Update

```bash
# 1. Backup manual dulu (extra safety)
cp hotspot.db hotspot.db.manual-backup

# 2. Jalankan update script
./scripts/update-production.sh

# 3. Verifikasi database masih ada dan tidak kosong
ls -lh hotspot.db
sqlite3 hotspot.db "SELECT COUNT(*) FROM users;"
```

### Test 3: Verifikasi Backup

```bash
# Cek backup terbaru
ls -lht backups/ | head -5

# Test restore dari backup
cp backups/hotspot_YYYYMMDD_HHMMSS.db hotspot.db.test
sqlite3 hotspot.db.test "SELECT COUNT(*) FROM users;"
```

---

## ⚠️ Catatan Penting

### 1. **Jangan Commit Database**

**JANGAN:**
```bash
git add hotspot.db  # ❌ JANGAN LAKUKAN INI!
git commit -m "update database"  # ❌ JANGAN!
```

**KENAPA:**
- Database berisi data production
- Database besar (akan memperlambat git)
- Database berubah setiap saat (conflict risk)

### 2. **Jangan Pakai `git stash`**

**JANGAN:**
```bash
git stash        # ❌ Bisa hilangkan database
git pull
git stash pop    # ❌ Bisa overwrite database
```

**GANTI DENGAN:**
```bash
git reset --hard HEAD  # ✅ Database aman (di .gitignore)
git pull
```

### 3. **Selalu Backup Sebelum Update**

Meskipun script sudah auto-backup, untuk extra safety:

```bash
# Manual backup sebelum update besar
cp hotspot.db backups/hotspot_manual_$(date +%Y%m%d_%H%M%S).db
```

---

## 🚨 Jika Database Hilang (Emergency)

### Step 1: Stop Application
```bash
pm2 stop smansada-hotspot
```

### Step 2: Restore dari Backup
```bash
# Cari backup terbaru
ls -lht backups/

# Restore
cp backups/hotspot_YYYYMMDD_HHMMSS.db hotspot.db

# Fix permissions
chmod 664 hotspot.db
chown user:user hotspot.db
```

### Step 3: Verify Database
```bash
# Test database
sqlite3 hotspot.db "SELECT COUNT(*) FROM users;"
sqlite3 hotspot.db "SELECT COUNT(*) FROM settings;"
```

### Step 4: Restart Application
```bash
pm2 restart smansada-hotspot
```

---

## 📊 Monitoring

### Cek Backup Regular

```bash
# List semua backup
ls -lht backups/

# Cek ukuran backup
du -sh backups/

# Cek backup terbaru
ls -lht backups/ | head -1
```

### Cek Database Integrity

```bash
# Verify database tidak corrupt
sqlite3 hotspot.db "PRAGMA integrity_check;"
# Output: ok (berarti database sehat)
```

---

## ✅ Kesimpulan

**Script update sudah AMAN dengan:**
1. ✅ Backup otomatis sebelum update
2. ✅ Git ignore protection
3. ✅ Explicit exclusion dari git clean
4. ✅ Verifikasi database setelah update
5. ✅ Auto-restore dari backup jika perlu
6. ✅ Safety check git tracking

**Database akan AMAN saat update karena:**
- Database tidak di-track oleh git (di `.gitignore`)
- `git reset --hard HEAD` tidak menghapus untracked files
- `git clean` sudah exclude database
- Backup dibuat sebelum operasi apapun
- Verifikasi dan restore otomatis jika ada masalah

---

**Last Updated:** 2025-01-02


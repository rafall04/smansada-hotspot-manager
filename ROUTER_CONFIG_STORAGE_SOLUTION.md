# Solusi Penyimpanan Router Config yang Lebih Reliable

## 🎯 Masalah

Router config (IP, username, password) masih hilang setelah reboot Ubuntu meskipun sudah menggunakan JSON file.

## 💡 Solusi: Multi-Layer Storage dengan Fallback

Menggunakan **3 layer storage** dengan prioritas fallback:

1. **Environment Variables** (Paling Reliable) ✅
2. **JSON File** (Fast, Easy Debug)
3. **Database** (Backup/Migration)

### Keuntungan:

- ✅ **Environment Variables**: Tidak bisa hilang, selalu ada di memory process
- ✅ **Auto-fallback**: Jika satu layer gagal, otomatis coba layer berikutnya
- ✅ **Multi-backup**: Simpan ke file DAN database untuk redundancy
- ✅ **Auto-migration**: Otomatis migrate dari database ke file jika perlu

## 📋 Implementasi

### 1. Environment Variables (Recommended untuk Production)

**Setup di `.env` atau systemd service:**

```bash
# .env file
ROUTER_IP=192.168.88.1
ROUTER_PORT=8728
ROUTER_USER=admin
ROUTER_PASSWORD_ENCRYPTED=encrypted_hex_string_here
```

**Atau di systemd service file:**

```ini
[Service]
Environment="ROUTER_IP=192.168.88.1"
Environment="ROUTER_PORT=8728"
Environment="ROUTER_USER=admin"
Environment="ROUTER_PASSWORD_ENCRYPTED=encrypted_hex_string"
```

**Keuntungan:**
- ✅ Tidak bisa hilang (ada di process environment)
- ✅ Tidak terpengaruh file system issues
- ✅ Tidak terpengaruh permission issues
- ✅ Survive reboot (jika di-set di systemd/PM2)

### 2. JSON File (Fallback)

Jika environment variables tidak ada, gunakan JSON file.

**Keuntungan:**
- ✅ Mudah di-debug (bisa langsung edit)
- ✅ Fast read/write
- ✅ Atomic write dengan fsync

### 3. Database (Backup/Migration)

Jika file tidak ada, coba database (untuk migration dari versi lama).

**Keuntungan:**
- ✅ Backup jika file corrupt
- ✅ Migration path dari versi lama

## 🔄 Flow Diagram

```
Get Router Config:
┌─────────────────────┐
│ Environment Vars?   │ → YES → Return (Most Reliable)
└─────────────────────┘
         ↓ NO
┌─────────────────────┐
│ JSON File?          │ → YES → Return + Auto-migrate to file
└─────────────────────┘
         ↓ NO
┌─────────────────────┐
│ Database?           │ → YES → Return + Auto-migrate to file
└─────────────────────┘
         ↓ NO
┌─────────────────────┐
│ Return Defaults     │
└─────────────────────┘

Save Router Config:
┌─────────────────────┐
│ Save to JSON File   │ → Primary Storage
└─────────────────────┘
         +
┌─────────────────────┐
│ Save to Database     │ → Backup Storage
└─────────────────────┘
         ↓
    At least one
    must succeed
```

## 🚀 Setup untuk Production

### ✅ Environment Variables (PRIMARY - Recommended)

**Environment Variables adalah PRIMARY storage method** dan **wajib digunakan untuk production** untuk mencegah data loss.

**1. Encrypt password terlebih dahulu:**

```bash
node -e "const crypto = require('./utils/cryptoHelper'); console.log(crypto.encrypt('your_password'))"
```

**2. Set di `.env`:**

```env
ROUTER_IP=192.168.88.1
ROUTER_PORT=8728
ROUTER_USER=admin
ROUTER_PASSWORD_ENCRYPTED=encrypted_hex_string_here
```

**3. Atau set di PM2 ecosystem.config.js:**

```javascript
module.exports = {
  apps: [{
    name: 'smansada-hotspot',
    script: './app.js',
    env: {
      ROUTER_IP: '192.168.88.1',
      ROUTER_PORT: '8728',
      ROUTER_USER: 'admin',
      ROUTER_PASSWORD_ENCRYPTED: 'encrypted_hex_string_here'
    }
  }]
};
```

**4. Atau set di systemd service:**

```ini
[Service]
Environment="ROUTER_IP=192.168.88.1"
Environment="ROUTER_PORT=8728"
Environment="ROUTER_USER=admin"
Environment="ROUTER_PASSWORD_ENCRYPTED=encrypted_hex_string"
```

### Option 2: JSON File (Current Method)

Tetap menggunakan JSON file, tapi sekarang dengan:
- ✅ Auto-backup ke database
- ✅ Fallback ke database jika file corrupt
- ✅ Better error handling

## 🔧 Migration

**Tidak perlu manual migration!** Sistem akan otomatis:

1. Cek environment variables dulu
2. Jika tidak ada, cek JSON file
3. Jika tidak ada, cek database (untuk data lama)
4. Auto-migrate dari database ke file jika ditemukan

## ✅ Benefits

1. **Triple Redundancy**: 3 layer storage = sangat reliable
2. **Auto-Fallback**: Otomatis coba layer berikutnya jika satu gagal
3. **Environment Variables**: Paling reliable, tidak terpengaruh file system
4. **Auto-Migration**: Otomatis migrate data lama
5. **Better Error Handling**: Logging yang jelas untuk debugging

## 🐛 Troubleshooting

### Masalah: Config masih hilang setelah reboot

**Solusi 1: Gunakan Environment Variables**

```bash
# Set di .env
ROUTER_IP=192.168.88.1
ROUTER_PORT=8728
ROUTER_USER=admin
ROUTER_PASSWORD_ENCRYPTED=your_encrypted_password

# Restart PM2
pm2 restart smansada-hotspot
```

**Solusi 2: Cek file permissions**

```bash
ls -lh router-config.json
sudo chown USER:USER router-config.json
sudo chmod 600 router-config.json
```

**Solusi 3: Cek disk space**

```bash
df -h
```

### Masalah: Environment variables tidak terbaca

**Cek:**
1. Apakah `.env` file ada?
2. Apakah PM2/systemd membaca `.env`?
3. Cek dengan: `pm2 env smansada-hotspot | grep ROUTER`

## 📊 Comparison

| Method | Reliability | Speed | Easy Debug | Survive Reboot |
|--------|------------|-------|------------|----------------|
| Environment Variables | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | ✅ Yes |
| JSON File | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⚠️ Depends |
| Database | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⚠️ Depends |
| **Multi-Layer** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ✅ **Yes** |

## 🎯 Recommendation

**Untuk Production Ubuntu:**

1. **Primary**: Gunakan Environment Variables (di `.env` atau systemd)
2. **Backup**: Sistem otomatis simpan ke JSON file dan database
3. **Fallback**: Jika env vars tidak ada, otomatis gunakan file/database

Ini memberikan **maximum reliability** dengan **zero data loss**.

---

**Last Updated**: 2025-01-02  
**Version**: 2.0  
**Status**: ✅ Recommended Solution


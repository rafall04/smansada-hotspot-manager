# Router Configuration: JSON File Storage

## 📋 Overview

Router configuration (IP, username, password) sekarang disimpan di file JSON (`router-config.json`) instead of database untuk mencegah data loss setelah reboot Ubuntu.

## 🔄 Perubahan

### Sebelumnya
- Router config disimpan di database SQLite (`settings` table)
- Masalah: Data bisa hilang setelah reboot karena SQLite persistence issues

### Sekarang
- Router config disimpan di file JSON (`router-config.json`)
- Settings lain (telegram, school_name, dll) tetap di database
- Lebih reliable karena file-based dengan atomic write + fsync

## 📁 File Structure

```
project/
├── router-config.json          # Router configuration (IP, username, encrypted password)
├── router-config.json.backup   # Auto backup sebelum write
└── router-config.json.tmp      # Temporary file untuk atomic write
```

## 🔒 Security

- Password tetap di-encrypt menggunakan AES-256-CBC (sama seperti sebelumnya)
- File JSON tidak di-commit ke Git (ada di `.gitignore`)
- File hanya bisa diakses oleh user yang menjalankan aplikasi

## 📝 Format JSON

```json
{
  "router_ip": "192.168.88.1",
  "router_port": 8728,
  "router_user": "admin",
  "router_password_encrypted": "encrypted_hex_string_here"
}
```

## 🔧 Migration

Jika ada data router config di database, sistem akan otomatis:
1. Membaca dari JSON file (jika ada)
2. Jika tidak ada, menggunakan default values
3. Saat update settings, data akan disimpan ke JSON

**Tidak perlu migration script** - sistem akan otomatis menggunakan JSON pada update pertama.

## ✅ Benefits

1. **More Reliable**: File-based storage lebih reliable daripada SQLite untuk critical config
2. **Atomic Writes**: Menggunakan temporary file + rename untuk atomic write
3. **OS fsync**: Memaksa OS menulis ke disk sebelum selesai
4. **Auto Backup**: Membuat backup otomatis sebelum write
5. **Easy Debug**: Bisa langsung edit file JSON jika perlu (dengan hati-hati)
6. **Auto Reload**: ✅ **TIDAK PERLU RESTART** - Config otomatis ter-reload setiap request

## 🔄 Auto Reload Behavior

**PENTING**: Router config **AUTO RELOAD** tanpa perlu restart aplikasi!

### Cara Kerja:
1. `Settings.get()` dipanggil pada **setiap HTTP request** (via middleware di `app.js`)
2. `Settings.get()` memanggil `routerConfig.getRouterConfig()` setiap kali
3. `routerConfig.getRouterConfig()` membaca file JSON **setiap kali** (tidak ada caching)
4. Jadi perubahan router config langsung aktif pada request berikutnya

### Contoh:
```javascript
// Request 1: Update router IP dari 192.168.88.1 ke 192.168.1.1
// → Settings.update() menyimpan ke router-config.json
// → File JSON ter-update

// Request 2: MikrotikService.getRouterConfig() dipanggil
// → Settings.get() membaca router-config.json (file terbaru)
// → Menggunakan IP baru (192.168.1.1) ✅
```

### Tidak Perlu:
- ❌ Restart aplikasi
- ❌ Restart PM2
- ❌ Reload module
- ❌ Clear cache

### Langsung Aktif:
- ✅ Setelah update settings, config langsung digunakan
- ✅ Request berikutnya sudah menggunakan config baru
- ✅ Mikrotik connection langsung menggunakan IP/username/password baru

## 🐛 Troubleshooting

### Masalah: router-config.json tidak ada

**Solusi:**
```bash
# File akan dibuat otomatis saat pertama kali update settings
# Atau bisa buat manual:
cat > router-config.json << EOF
{
  "router_ip": "192.168.88.1",
  "router_port": 8728,
  "router_user": "admin",
  "router_password_encrypted": ""
}
EOF
```

### Masalah: Permission denied

**Solusi:**
```bash
# Fix ownership
sudo chown USER:USER router-config.json
sudo chmod 600 router-config.json  # Read/write hanya untuk owner
```

### Masalah: Data hilang setelah reboot

**Cek:**
1. Apakah file ada? `ls -lh router-config.json`
2. Apakah permission benar? `stat router-config.json`
3. Apakah disk space cukup? `df -h`
4. Cek log untuk error: `pm2 logs`

## 📚 Code References

- `utils/routerConfig.js` - Router config manager
- `models/Settings.js` - Settings model (menggunakan routerConfig)
- `services/mikrotikService.js` - Menggunakan Settings.get() yang sudah include router config

## ⚠️ Important Notes

1. **Backup**: File JSON akan di-backup otomatis sebelum write
2. **Atomic Write**: Menggunakan temporary file + rename untuk mencegah corruption
3. **fsync**: Memaksa OS flush ke disk untuk mencegah data loss
4. **Verification**: Setelah write, sistem akan verify data tersimpan dengan benar

---

**Last Updated**: 2025-01-02  
**Version**: 1.0  
**Status**: ✅ Implemented


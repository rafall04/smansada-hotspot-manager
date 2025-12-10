# Setup Router Configuration dengan Environment Variables

## 🎯 Overview

Router configuration sekarang menggunakan **Environment Variables sebagai PRIMARY storage**. Ini adalah metode **paling reliable** dan akan **survive reboot** di Ubuntu.

## ✅ Keuntungan Environment Variables

1. ✅ **Tidak bisa hilang** - Data ada di process memory
2. ✅ **Tidak terpengaruh file system issues** - Tidak perlu write ke disk
3. ✅ **Tidak terpengaruh permission issues** - Tidak perlu file permissions
4. ✅ **Survive reboot** - Jika di-set di systemd/PM2, akan tetap ada setelah reboot
5. ✅ **Most reliable** - Recommended untuk production

## 📋 Setup Steps

### Step 1: Generate Encrypted Password

```bash
# Generate encrypted password dari plain password
node scripts/setup-router-env.js your_router_password
```

Output akan menampilkan encrypted password yang bisa digunakan.

### Step 2: Setup di .env File (Recommended)

**1. Buat atau edit file `.env` di root project:**

```bash
nano .env
```

**2. Tambahkan router configuration:**

```env
# Router Configuration (PRIMARY - Most Reliable)
ROUTER_IP=192.168.88.1
ROUTER_PORT=8728
ROUTER_USER=admin
ROUTER_PASSWORD_ENCRYPTED=encrypted_hex_string_from_step_1
```

**3. Pastikan `.env` file ada di `.gitignore` (sudah ada)**

### Step 3: Setup di PM2 Ecosystem (Alternative)

Jika tidak menggunakan `.env` file, bisa set langsung di `ecosystem.config.js`:

```javascript
env: {
  NODE_ENV: 'production',
  PORT: 3000,
  ROUTER_IP: '192.168.88.1',
  ROUTER_PORT: '8728',
  ROUTER_USER: 'admin',
  ROUTER_PASSWORD_ENCRYPTED: 'encrypted_hex_string_here'
}
```

### Step 4: Restart Application

```bash
# Jika menggunakan PM2
pm2 restart smansada-hotspot

# Atau jika menggunakan npm
npm restart
```

## 🔄 Cara Kerja

### Priority Order:

1. **Environment Variables** (PRIMARY) ✅
   - Jika `ROUTER_IP`, `ROUTER_USER`, `ROUTER_PASSWORD_ENCRYPTED` ada di env vars
   - Akan digunakan langsung
   - Auto-backup ke JSON file (non-blocking)

2. **JSON File** (FALLBACK 1)
   - Jika env vars tidak ada, cek `router-config.json`
   - Digunakan jika file ada dan valid

3. **Database** (FALLBACK 2)
   - Jika file tidak ada, cek database
   - Auto-migrate ke file jika ditemukan

4. **Defaults** (FALLBACK 3)
   - Jika semua tidak ada, gunakan defaults

### Saat Update Settings:

- Jika **env vars sudah di-set**: 
  - Update di web UI akan **save ke file/database sebagai backup**
  - Tapi **env vars tetap digunakan** untuk reading
  - **Warning akan muncul** mengingatkan untuk update .env file

- Jika **env vars tidak di-set**:
  - Update di web UI akan **save ke file dan database**
  - Normal operation seperti biasa

## 🐛 Troubleshooting

### Masalah: Environment variables tidak terbaca

**Cek:**
```bash
# Cek apakah .env file ada
ls -la .env

# Cek apakah PM2 membaca .env
pm2 env smansada-hotspot | grep ROUTER

# Cek environment variables di process
pm2 show smansada-hotspot | grep env
```

**Solusi:**
1. Pastikan `.env` file ada di root project
2. Pastikan `dotenv` sudah di-load di `app.js` (sudah ada)
3. Restart PM2: `pm2 restart smansada-hotspot`

### Masalah: Password tidak ter-update setelah edit di web UI

**Penyebab:** Environment variables sudah di-set dan take precedence.

**Solusi:**
1. Update `.env` file dengan password baru (encrypted)
2. Restart aplikasi: `pm2 restart smansada-hotspot`

**Atau:**
1. Hapus environment variables dari `.env` file
2. Restart aplikasi
3. Update via web UI (akan save ke file/database)

### Masalah: Config masih hilang setelah reboot

**Jika menggunakan .env file:**
- Pastikan `.env` file ada dan readable
- Pastikan PM2/systemd membaca `.env` file
- Cek: `pm2 env smansada-hotspot | grep ROUTER`

**Jika menggunakan PM2 ecosystem:**
- Pastikan `ecosystem.config.js` sudah di-update
- Restart PM2: `pm2 restart smansada-hotspot`
- Save PM2: `pm2 save`

## 📝 Best Practices

### Untuk Production:

1. **Gunakan Environment Variables** (di `.env` atau systemd)
2. **Backup .env file** secara terpisah
3. **Jangan commit .env** ke Git (sudah di `.gitignore`)
4. **Set proper permissions**: `chmod 600 .env`

### Untuk Development:

- Bisa tetap menggunakan JSON file (env vars optional)
- Atau set env vars untuk testing

## 🔒 Security Notes

- ✅ Encrypted password di env vars tetap aman (AES-256-CBC)
- ✅ `.env` file tidak di-commit ke Git
- ✅ Set file permissions: `chmod 600 .env`
- ✅ Jangan log environment variables ke console

## 📚 Related Files

- `utils/routerConfigStorage.js` - Multi-layer storage implementation
- `scripts/setup-router-env.js` - Helper untuk generate encrypted password
- `ROUTER_CONFIG_STORAGE_SOLUTION.md` - Dokumentasi lengkap solusi

---

**Last Updated**: 2025-01-02  
**Version**: 1.0  
**Status**: ✅ Ready for Production


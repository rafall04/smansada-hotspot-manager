# Quick Start: Setup Router Config dengan Environment Variables

## 🚀 Setup Cepat (5 Menit)

### Step 1: Generate Encrypted Password

```bash
node scripts/setup-router-env.js your_router_password
```

Copy encrypted password yang dihasilkan.

### Step 2: Buat/Edit .env File

```bash
nano .env
```

Tambahkan:

```env
ROUTER_IP=192.168.88.1
ROUTER_PORT=8728
ROUTER_USER=admin
ROUTER_PASSWORD_ENCRYPTED=paste_encrypted_password_here
```

### Step 3: Restart Aplikasi

```bash
pm2 restart smansada-hotspot
```

## ✅ Selesai!

Router config sekarang menggunakan environment variables dan **tidak akan hilang setelah reboot**.

## 📝 Verifikasi

Cek log untuk konfirmasi:

```bash
pm2 logs smansada-hotspot | grep RouterConfigStorage
```

Harus muncul:
```
[RouterConfigStorage] ✓ Loaded from environment variables (PRIMARY)
```

## 🔄 Update Router Config

Jika perlu update router config:

1. **Edit `.env` file** dengan nilai baru
2. **Restart aplikasi**: `pm2 restart smansada-hotspot`

**Atau** update via web UI (akan save sebagai backup, tapi env vars tetap digunakan).

## 📚 Dokumentasi Lengkap

Lihat `SETUP_ROUTER_ENV.md` untuk dokumentasi lengkap.

---

**Last Updated**: 2025-01-02


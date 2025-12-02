# PM2 Setup & Autostart Guide

Panduan lengkap untuk setup PM2 sebagai process manager dan autostart aplikasi saat server boot.

## Prerequisites

- Node.js v20 LTS terinstall
- Aplikasi sudah berjalan dengan `npm start`
- Akses root/sudo untuk setup autostart

---

## Step 1: Install PM2

```bash
# Install PM2 secara global
npm install -g pm2
```

---

## Step 2: Start Aplikasi dengan PM2

### Opsi A: Menggunakan npm script (Recommended)

```bash
# Start aplikasi
pm2 start npm --name "smansada-hotspot" -- start

# Atau gunakan script yang sudah disediakan
npm run pm2:start
```

### Opsi B: Start langsung dengan node

```bash
pm2 start app.js --name "smansada-hotspot"
```

### Opsi C: Menggunakan ecosystem file (Advanced)

```bash
# Start dengan ecosystem config
pm2 start ecosystem.config.js
```

---

## Step 3: Setup Autostart (CRITICAL)

PM2 dapat menyimpan konfigurasi startup dan mengaktifkan autostart saat boot.

### 3.1 Generate Startup Script

```bash
# Generate startup script untuk sistem Anda
pm2 startup

# Output akan menampilkan perintah yang harus dijalankan, contoh:
# sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u root --hp /root
```

**PENTING:** Jalankan perintah yang ditampilkan oleh PM2 (biasanya memerlukan `sudo`).

### 3.2 Save Current PM2 Process List

```bash
# Simpan daftar proses yang sedang berjalan
pm2 save
```

Ini akan menyimpan konfigurasi ke `~/.pm2/dump.pm2`.

---

## Step 4: Verifikasi Autostart

### Test Reboot

```bash
# Reboot server untuk test autostart
sudo reboot

# Setelah reboot, cek apakah aplikasi berjalan
pm2 list
pm2 logs smansada-hotspot
```

### Manual Check

```bash
# Cek status PM2
pm2 status

# Cek logs
pm2 logs smansada-hotspot

# Cek info detail
pm2 info smansada-hotspot
```

---

## PM2 Commands Cheat Sheet

### Basic Commands

```bash
# Start aplikasi
pm2 start npm --name "smansada-hotspot" -- start

# Stop aplikasi
pm2 stop smansada-hotspot

# Restart aplikasi
pm2 restart smansada-hotspot

# Reload aplikasi (zero-downtime)
pm2 reload smansada-hotspot

# Delete dari PM2
pm2 delete smansada-hotspot

# List semua proses
pm2 list

# Monitor real-time
pm2 monit
```

### Logs Management

```bash
# Lihat logs
pm2 logs smansada-hotspot

# Lihat logs dengan limit baris
pm2 logs smansada-hotspot --lines 100

# Clear logs
pm2 flush

# Lihat error logs saja
pm2 logs smansada-hotspot --err
```

### Monitoring

```bash
# Real-time monitoring
pm2 monit

# Info detail proses
pm2 info smansada-hotspot

# Cek penggunaan resource
pm2 show smansada-hotspot
```

### Update & Maintenance

```bash
# Update PM2
npm install -g pm2@latest
pm2 update

# Save current process list (setelah perubahan)
pm2 save

# Resurrect saved processes
pm2 resurrect
```

---

## Troubleshooting

### PM2 tidak autostart setelah reboot

```bash
# 1. Cek apakah startup script sudah terinstall
pm2 startup

# 2. Hapus startup script lama (jika ada)
pm2 unstartup

# 3. Generate ulang startup script
pm2 startup

# 4. Save process list
pm2 save
```

### Aplikasi crash terus-menerus

```bash
# Cek logs untuk error
pm2 logs smansada-hotspot --err

# Cek konfigurasi
pm2 info smansada-hotspot

# Restart dengan delay
pm2 restart smansada-hotspot --update-env
```

### Port sudah digunakan

```bash
# Cek port yang digunakan
sudo netstat -tulpn | grep :3000

# Atau
sudo lsof -i :3000

# Stop aplikasi yang menggunakan port
pm2 stop smansada-hotspot
```

### Database locked error

```bash
# Stop aplikasi
pm2 stop smansada-hotspot

# Cek apakah ada proses lain yang menggunakan database
lsof hotspot.db

# Restart aplikasi
pm2 restart smansada-hotspot
```

---

## Advanced Configuration

### Ecosystem File (ecosystem.config.js)

File ini sudah disediakan di root project. Konfigurasi mencakup:

- **Name**: Nama proses di PM2
- **Script**: File yang dijalankan
- **Instances**: Jumlah instance (1 untuk single instance)
- **Exec_mode**: Mode eksekusi (fork untuk single instance)
- **Env**: Environment variables
- **Error/Out logs**: Path untuk log files
- **Restart policy**: Auto restart saat crash

### Update Ecosystem Config

Edit `ecosystem.config.js` sesuai kebutuhan, lalu:

```bash
# Delete proses lama
pm2 delete smansada-hotspot

# Start dengan config baru
pm2 start ecosystem.config.js

# Save untuk autostart
pm2 save
```

---

## Best Practices

1. **Selalu gunakan `pm2 save`** setelah membuat perubahan
2. **Monitor logs** secara berkala untuk mendeteksi error
3. **Setup log rotation** untuk mencegah disk penuh
4. **Gunakan `pm2 reload`** untuk zero-downtime deployment
5. **Backup database** sebelum update aplikasi
6. **Test autostart** setelah setup dengan reboot server

---

## Quick Setup Script

Jalankan script berikut untuk setup cepat:

```bash
# Install PM2
npm install -g pm2

# Start aplikasi
pm2 start npm --name "smansada-hotspot" -- start

# Setup autostart (jalankan perintah yang ditampilkan)
pm2 startup

# Save configuration
pm2 save

# Verify
pm2 list
pm2 logs smansada-hotspot
```

---

## Support

Jika mengalami masalah:

1. Cek logs: `pm2 logs smansada-hotspot`
2. Cek status: `pm2 status`
3. Cek info: `pm2 info smansada-hotspot`
4. Review dokumentasi PM2: https://pm2.keymetrics.io/docs/


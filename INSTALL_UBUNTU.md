# Installation Guide untuk Ubuntu 20.04

## Masalah
Error saat install `better-sqlite3` karena compiler g++ tidak mendukung C++20 standard.

## Solusi

### 1. Install Build Tools dan Dependencies

```bash
# Update package list
sudo apt update

# Install build essentials dan dependencies
sudo apt install -y build-essential python3-dev

# Install g++ versi yang lebih baru (g++-10 atau g++-11)
sudo apt install -y g++-10

# Set g++-10 sebagai default (opsional)
sudo update-alternatives --install /usr/bin/g++ g++ /usr/bin/g++-10 100

# Install SQLite development libraries
sudo apt install -y libsqlite3-dev

# Install node-gyp dependencies
sudo apt install -y make
```

### 2. Alternatif: Upgrade ke g++-11 (Recommended)

Jika g++-10 masih tidak cukup, install g++-11:

```bash
# Add repository untuk g++-11
sudo add-apt-repository -y ppa:ubuntu-toolchain-r/test
sudo apt update

# Install g++-11
sudo apt install -y g++-11

# Set sebagai default
sudo update-alternatives --install /usr/bin/g++ g++ /usr/bin/g++-11 100
sudo update-alternatives --install /usr/bin/gcc gcc /usr/bin/gcc-11 100
```

### 3. Verifikasi Versi Compiler

```bash
g++ --version
# Harus menunjukkan versi 10 atau 11
```

### 4. Install Node Modules

```bash
# Clear npm cache
npm cache clean --force

# Install dependencies
npm install
```

### 5. Jika Masih Error: Downgrade Node.js (Alternatif)

Jika masalah masih terjadi, pertimbangkan untuk menggunakan Node.js LTS (v20.x):

```bash
# Install nvm (Node Version Manager)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc

# Install Node.js LTS
nvm install 20
nvm use 20

# Verifikasi
node -v  # Harus menunjukkan v20.x.x

# Install dependencies
npm install
```

## Troubleshooting

### Error: "unrecognized command line option '-std=gnu++20'"
- **Solusi**: Upgrade g++ ke versi 10 atau 11 (lihat langkah 1 atau 2 di atas)

### Error: "Python not found"
- **Solusi**: `sudo apt install -y python3-dev`

### Error: "make: command not found"
- **Solusi**: `sudo apt install -y build-essential`

### Error: "libsqlite3-dev not found"
- **Solusi**: `sudo apt install -y libsqlite3-dev`

## Catatan

- Ubuntu 20.04 default g++ (versi 9) tidak mendukung C++20
- `better-sqlite3` memerlukan C++20 untuk kompilasi native module
- Node.js v24 memerlukan compiler yang lebih baru
- Disarankan menggunakan Node.js LTS (v20) untuk stabilitas


# Struktur Folder Project MVC

```
tools-smansada/
├── app.js                      # Main application entry point
├── setup_db.js                 # Database initialization script
├── package.json                # Dependencies
├── .env                        # Environment variables (not in repo)
├── hotspot.db                  # SQLite database file
│
├── models/                     # Database Models (Data Layer)
│   ├── User.js                 # User model (CRUD operations)
│   └── Settings.js             # Settings model (Router config)
│
├── controllers/                # Controllers (Business Logic)
│   ├── authController.js       # Authentication (login/logout)
│   ├── adminController.js      # Admin operations
│   └── guruController.js      # Guru operations
│
├── services/                   # Service Layer (External APIs)
│   └── mikrotikService.js      # Mikrotik API service
│
├── middlewares/                # Middleware Functions
│   └── authMiddleware.js      # Authentication & Authorization
│
├── routes/                     # Route Definitions
│   └── index.js                # All application routes
│
└── views/                      # EJS Templates (Views)
    ├── layouts/
    │   └── main.ejs            # Main layout template
    ├── auth/
    │   └── login.ejs           # Login page
    ├── admin/
    │   ├── dashboard.ejs       # Admin dashboard
    │   ├── settings.ejs        # Router settings
    │   └── users.ejs           # User management
    ├── guru/
    │   └── dashboard.ejs       # Guru dashboard
    └── error.ejs               # Error page
```

## Penjelasan Struktur MVC

### 1. **Models** (`models/`)

- **User.js**: Model untuk operasi database tabel `users`
- **Settings.js**: Model untuk operasi database tabel `settings`
- Semua query database dilakukan di sini

### 2. **Controllers** (`controllers/`)

- **authController.js**: Handle login/logout
- **adminController.js**: Handle semua operasi admin (dashboard, settings, user management)
- **guruController.js**: Handle operasi guru (dashboard, update password, kick session)

### 3. **Services** (`services/`)

- **mikrotikService.js**: Service layer untuk komunikasi dengan Mikrotik API
- Mengambil konfigurasi router dari database (bukan .env)
- Fungsi reusable: `getHotspotUserByComment`, `updateHotspotUser`, `kickActiveUser`

### 4. **Middlewares** (`middlewares/`)

- **authMiddleware.js**:
  - `isAuthenticated`: Cek apakah user sudah login
  - `isAdmin`: Cek apakah user adalah admin
  - `isGuru`: Cek apakah user adalah guru

### 5. **Routes** (`routes/`)

- **index.js**: Semua route definitions
- Menggabungkan controllers dengan middlewares

### 6. **Views** (`views/`)

- Template EJS untuk UI
- Terorganisir berdasarkan role (admin/guru) dan fungsi

## Flow Request

1. **Request masuk** → `app.js`
2. **Route matching** → `routes/index.js`
3. **Middleware check** → `middlewares/authMiddleware.js`
4. **Controller** → `controllers/*.js`
5. **Service (jika perlu)** → `services/mikrotikService.js`
6. **Model (jika perlu)** → `models/*.js`
7. **Response** → `views/*.ejs`

## Keuntungan Struktur MVC

✅ **Separation of Concerns**: Setiap layer punya tanggung jawab jelas
✅ **Maintainability**: Mudah dirawat dan diupdate
✅ **Scalability**: Mudah menambah fitur baru
✅ **Testability**: Setiap layer bisa di-test terpisah
✅ **Reusability**: Service layer bisa digunakan di berbagai controller

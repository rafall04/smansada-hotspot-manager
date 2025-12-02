require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const Database = require('better-sqlite3');
const { RouterOSAPI } = require('node-routeros-v2');

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection
const dbPath = path.join(__dirname, 'hotspot.db');
const db = new Database(dbPath);

// Session configuration
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  })
);

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Mikrotik connection helper
function getMikrotikConnection() {
  return new RouterOSAPI({
    host: process.env.MIKROTIK_HOST || '192.168.88.1',
    user: process.env.MIKROTIK_USER || 'admin',
    password: process.env.MIKROTIK_PASSWORD || 'admin',
    port: parseInt(process.env.MIKROTIK_PORT || '8728')
  });
}

// Sync hotspot user data from Mikrotik to database
async function syncHotspotUserFromMikrotik(userId, mikrotikComment) {
  try {
    const conn = getMikrotikConnection();
    await conn.connect();

    // Find hotspot user by comment
    const hotspotUsers = await conn.write('/ip/hotspot/user/print', [
      '?comment=' + mikrotikComment
    ]);

    if (!hotspotUsers || hotspotUsers.length === 0) {
      conn.close();
      return null;
    }

    const hotspotUser = hotspotUsers[0];

    // Upsert to database (check if exists first)
    const existing = db
      .prepare(
        `
      SELECT id FROM hotspot_users 
      WHERE user_id = ? AND comment = ?
    `
      )
      .get(userId, mikrotikComment);

    if (existing) {
      // Update existing
      const updateStmt = db.prepare(`
        UPDATE hotspot_users 
        SET mikrotik_id = ?,
            hotspot_username = ?,
            hotspot_password = ?,
            profile = ?,
            limit_uptime = ?,
            limit_bytes_total = ?,
            last_sync = CURRENT_TIMESTAMP
        WHERE user_id = ? AND comment = ?
      `);
      updateStmt.run(
        hotspotUser['.id'],
        hotspotUser.name || '',
        hotspotUser.password || '',
        hotspotUser.profile || null,
        hotspotUser['limit-uptime'] || null,
        hotspotUser['limit-bytes-total'] || null,
        userId,
        mikrotikComment
      );
    } else {
      // Insert new
      const insertStmt = db.prepare(`
        INSERT INTO hotspot_users (
          user_id, mikrotik_id, hotspot_username, hotspot_password,
          profile, limit_uptime, limit_bytes_total, comment, last_sync
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);
      insertStmt.run(
        userId,
        hotspotUser['.id'],
        hotspotUser.name || '',
        hotspotUser.password || '',
        hotspotUser.profile || null,
        hotspotUser['limit-uptime'] || null,
        hotspotUser['limit-bytes-total'] || null,
        mikrotikComment
      );
    }

    conn.close();
    return hotspotUser;
  } catch (error) {
    console.error('Sync error:', error);
    throw error;
  }
}

// Get hotspot user from database (with optional sync from Mikrotik)
async function getHotspotUser(userId, mikrotikComment, forceSync = false) {
  // Get from database
  const cachedUser = db
    .prepare(
      `
    SELECT * FROM hotspot_users 
    WHERE user_id = ? AND comment = ?
  `
    )
    .get(userId, mikrotikComment);

  // If not in cache or force sync, fetch from Mikrotik
  if (!cachedUser || forceSync) {
    await syncHotspotUserFromMikrotik(userId, mikrotikComment);
    // Get updated data
    return db
      .prepare(
        `
      SELECT * FROM hotspot_users 
      WHERE user_id = ? AND comment = ?
    `
      )
      .get(userId, mikrotikComment);
  }

  return cachedUser;
}

// Middleware: Check if user is authenticated
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    next();
  } else {
    res.redirect('/login');
  }
}

// Routes

// Login page
app.get('/login', (req, res) => {
  if (req.session.userId) {
    return res.redirect('/dashboard');
  }
  res.render('login', { error: null });
});

// Login handler
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.render('login', { error: 'Username dan password harus diisi' });
  }

  try {
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

    if (!user) {
      return res.render('login', { error: 'Username atau password salah' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.render('login', { error: 'Username atau password salah' });
    }

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.mikrotikComment = user.mikrotik_comment;

    // Auto-sync hotspot user data from Mikrotik on login
    try {
      await syncHotspotUserFromMikrotik(user.id, user.mikrotik_comment);
    } catch (err) {
      console.error('Auto-sync error on login:', err);
      // Continue anyway, user can sync manually later
    }

    res.redirect('/dashboard');
  } catch (error) {
    console.error('Login error:', error);
    res.render('login', { error: 'Terjadi kesalahan saat login' });
  }
});

// Logout handler
app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/login');
  });
});

// Dashboard
app.get('/dashboard', requireAuth, async (req, res) => {
  // Get query parameters for messages
  const errorMsg = req.query.error || null;
  const successMsg = req.query.success || null;
  const forceSync = req.query.sync === 'true';

  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
    const mikrotikComment = user.mikrotik_comment;

    // Get hotspot user from database cache (sync from Mikrotik if needed)
    const hotspotUserData = await getHotspotUser(user.id, mikrotikComment, forceSync);

    let hotspotUser = null;
    let activeSession = null;
    let error = errorMsg;

    if (hotspotUserData) {
      // Convert database format to display format
      hotspotUser = {
        name: hotspotUserData.hotspot_username,
        password: hotspotUserData.hotspot_password,
        profile: hotspotUserData.profile,
        'limit-uptime': hotspotUserData.limit_uptime,
        'limit-bytes-total': hotspotUserData.limit_bytes_total,
        comment: hotspotUserData.comment,
        '.id': hotspotUserData.mikrotik_id
      };

      // Check active sessions (still need to query Mikrotik for real-time data)
      try {
        const conn = getMikrotikConnection();
        await conn.connect();

        const activeSessions = await conn.write('/ip/hotspot/active/print', [
          '?user=' + hotspotUser.name
        ]);

        if (activeSessions && activeSessions.length > 0) {
          activeSession = activeSessions[0];
        }

        conn.close();
      } catch (err) {
        console.error('Error checking active sessions:', err);
      }
    } else {
      error =
        errorMsg || 'User hotspot tidak ditemukan di Mikrotik dengan comment: ' + mikrotikComment;
    }

    res.render('dashboard', {
      user,
      hotspotUser,
      activeSession,
      error,
      success: successMsg,
      lastSync: hotspotUserData ? hotspotUserData.last_sync : null
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.render('dashboard', {
      user: { username: req.session.username },
      hotspotUser: null,
      activeSession: null,
      error: errorMsg || 'Gagal terhubung ke Mikrotik: ' + error.message,
      success: null,
      lastSync: null
    });
  }
});

// Update hotspot user
app.post('/dashboard/update', requireAuth, async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.redirect('/dashboard?error=Username dan password harus diisi');
  }

  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
    const mikrotikComment = user.mikrotik_comment;

    // Get current hotspot user from database
    const hotspotUserData = db
      .prepare(
        `
      SELECT * FROM hotspot_users 
      WHERE user_id = ? AND comment = ?
    `
      )
      .get(user.id, mikrotikComment);

    if (!hotspotUserData) {
      return res.redirect('/dashboard?error=User hotspot tidak ditemukan. Silakan sync ulang.');
    }

    // Connect to Mikrotik
    const conn = getMikrotikConnection();
    await conn.connect();

    const mikrotikId = hotspotUserData.mikrotik_id;

    // Check if new username already exists (excluding current user)
    const existingUsers = await conn.write('/ip/hotspot/user/print', ['?name=' + username]);

    if (existingUsers && existingUsers.length > 0) {
      const existingUser = existingUsers[0];
      if (existingUser['.id'] !== mikrotikId) {
        conn.close();
        return res.redirect('/dashboard?error=Username sudah digunakan oleh user lain');
      }
    }

    // Update user in Mikrotik (preserve comment!)
    await conn.write('/ip/hotspot/user/set', [
      '=.id=' + mikrotikId,
      '=name=' + username,
      '=password=' + password,
      '=comment=' + mikrotikComment // IMPORTANT: Preserve comment
    ]);

    conn.close();

    // Update database cache
    const updateStmt = db.prepare(`
      UPDATE hotspot_users 
      SET hotspot_username = ?, 
          hotspot_password = ?,
          last_sync = CURRENT_TIMESTAMP
      WHERE user_id = ? AND comment = ?
    `);
    updateStmt.run(username, password, user.id, mikrotikComment);

    res.redirect('/dashboard?success=User hotspot berhasil diperbarui');
  } catch (error) {
    console.error('Update error:', error);
    res.redirect('/dashboard?error=Gagal memperbarui user: ' + error.message);
  }
});

// Kick/Reset connection
app.post('/dashboard/kick', requireAuth, async (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
    const mikrotikComment = user.mikrotik_comment;

    // Get hotspot user from database cache
    const hotspotUserData = db
      .prepare(
        `
      SELECT * FROM hotspot_users 
      WHERE user_id = ? AND comment = ?
    `
      )
      .get(user.id, mikrotikComment);

    if (!hotspotUserData) {
      return res.redirect('/dashboard?error=User hotspot tidak ditemukan. Silakan sync ulang.');
    }

    // Connect to Mikrotik
    const conn = getMikrotikConnection();
    await conn.connect();

    // Find and remove active sessions
    const activeSessions = await conn.write('/ip/hotspot/active/print', [
      '?user=' + hotspotUserData.hotspot_username
    ]);

    if (activeSessions && activeSessions.length > 0) {
      for (const session of activeSessions) {
        await conn.write('/ip/hotspot/active/remove', ['=.id=' + session['.id']]);
      }
    }

    conn.close();

    res.redirect('/dashboard?success=Koneksi berhasil direset');
  } catch (error) {
    console.error('Kick error:', error);
    res.redirect('/dashboard?error=Gagal mereset koneksi: ' + error.message);
  }
});

// Admin routes - Manage users
app.get('/admin', requireAuth, (req, res) => {
  // Get all users with their hotspot data
  const users = db
    .prepare(
      `
    SELECT u.*, 
           h.hotspot_username, 
           h.hotspot_password,
           h.last_sync,
           h.mikrotik_id
    FROM users u
    LEFT JOIN hotspot_users h ON u.id = h.user_id
    ORDER BY u.created_at DESC
  `
    )
    .all();

  res.render('admin', {
    users,
    error: req.query.error || null,
    success: req.query.success || null
  });
});

// Add new user
app.post('/admin/users', requireAuth, async (req, res) => {
  const { username, password, mikrotik_comment } = req.body;

  if (!username || !password || !mikrotik_comment) {
    return res.redirect('/admin?error=Semua field harus diisi');
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    const insertStmt = db.prepare(`
      INSERT INTO users (username, password_hash, mikrotik_comment)
      VALUES (?, ?, ?)
    `);

    insertStmt.run(username, passwordHash, mikrotik_comment);

    // Try to sync from Mikrotik
    const newUser = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    try {
      await syncHotspotUserFromMikrotik(newUser.id, mikrotik_comment);
    } catch (err) {
      console.error('Sync error on user creation:', err);
    }

    res.redirect('/admin?success=User berhasil ditambahkan');
  } catch (error) {
    if (error.message.includes('UNIQUE constraint')) {
      return res.redirect('/admin?error=Username atau comment sudah digunakan');
    }
    console.error('Add user error:', error);
    res.redirect('/admin?error=Gagal menambahkan user: ' + error.message);
  }
});

// Update user
app.post('/admin/users/:id', requireAuth, async (req, res) => {
  const userId = req.params.id;
  const { username, password, mikrotik_comment } = req.body;

  if (!username || !mikrotik_comment) {
    return res.redirect('/admin?error=Username dan comment harus diisi');
  }

  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.redirect('/admin?error=User tidak ditemukan');
    }

    let updateQuery = 'UPDATE users SET username = ?, mikrotik_comment = ?';
    const params = [username, mikrotik_comment];

    // Update password if provided
    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      updateQuery += ', password_hash = ?';
      params.push(passwordHash);
    }

    updateQuery += ' WHERE id = ?';
    params.push(userId);

    db.prepare(updateQuery).run(...params);

    // Sync hotspot user if comment changed
    if (mikrotik_comment !== user.mikrotik_comment) {
      try {
        await syncHotspotUserFromMikrotik(userId, mikrotik_comment);
      } catch (err) {
        console.error('Sync error on user update:', err);
      }
    }

    res.redirect('/admin?success=User berhasil diperbarui');
  } catch (error) {
    if (error.message.includes('UNIQUE constraint')) {
      return res.redirect('/admin?error=Username atau comment sudah digunakan');
    }
    console.error('Update user error:', error);
    res.redirect('/admin?error=Gagal memperbarui user: ' + error.message);
  }
});

// Delete user
app.post('/admin/users/:id/delete', requireAuth, (req, res) => {
  const userId = req.params.id;

  try {
    // Check if trying to delete own account
    if (parseInt(userId) === req.session.userId) {
      return res.redirect('/admin?error=Tidak dapat menghapus akun sendiri');
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    res.redirect('/admin?success=User berhasil dihapus');
  } catch (error) {
    console.error('Delete user error:', error);
    res.redirect('/admin?error=Gagal menghapus user: ' + error.message);
  }
});

// Sync user from Mikrotik
app.post('/admin/users/:id/sync', requireAuth, async (req, res) => {
  const userId = req.params.id;

  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.redirect('/admin?error=User tidak ditemukan');
    }

    await syncHotspotUserFromMikrotik(userId, user.mikrotik_comment);
    res.redirect('/admin?success=User berhasil di-sync dari Mikrotik');
  } catch (error) {
    console.error('Sync error:', error);
    res.redirect('/admin?error=Gagal sync user: ' + error.message);
  }
});

// Root redirect
app.get('/', (req, res) => {
  if (req.session.userId) {
    res.redirect('/dashboard');
  } else {
    res.redirect('/login');
  }
});

// Error handler
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).send('Internal Server Error');
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Make sure to run "npm run init-db" to initialize the database');
});

const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');

const dbPath = path.join(__dirname, 'hotspot.db');
const db = new Database(dbPath);

// Create users table (for web login)
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    mikrotik_comment TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Create hotspot_users table (cache data dari Mikrotik)
db.exec(`
  CREATE TABLE IF NOT EXISTS hotspot_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    mikrotik_id TEXT,
    hotspot_username TEXT NOT NULL,
    hotspot_password TEXT NOT NULL,
    profile TEXT,
    limit_uptime TEXT,
    limit_bytes_total TEXT,
    comment TEXT NOT NULL,
    last_sync DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, comment)
  )
`);

// Seed dummy data
async function seedData() {
  const users = [
    {
      username: 'guru1',
      password: 'password123',
      mikrotik_comment: 'NIP_001'
    },
    {
      username: 'guru2',
      password: 'password123',
      mikrotik_comment: 'NIP_002'
    },
    {
      username: 'guru3',
      password: 'password123',
      mikrotik_comment: 'NIP_003'
    }
  ];

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO users (username, password_hash, mikrotik_comment)
    VALUES (?, ?, ?)
  `);

  for (const user of users) {
    const passwordHash = await bcrypt.hash(user.password, 10);
    insertStmt.run(user.username, passwordHash, user.mikrotik_comment);
    console.log(`✓ Seeded user: ${user.username} (${user.mikrotik_comment})`);
  }
}

// Initialize database
async function init() {
  try {
    console.log('Initializing database...');
    await seedData();
    console.log('Database initialized successfully!');
    console.log('Default credentials:');
    console.log('  - guru1 / password123 (NIP_001)');
    console.log('  - guru2 / password123 (NIP_002)');
    console.log('  - guru3 / password123 (NIP_003)');
  } catch (error) {
    console.error('Error initializing database:', error);
  } finally {
    db.close();
  }
}

// Run if called directly
if (require.main === module) {
  init();
}

module.exports = { db, init };

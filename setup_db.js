const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');

const dbPath = path.join(__dirname, 'hotspot.db');
const db = new Database(dbPath);

async function setupDatabase() {
  try {
    console.log('Setting up database...\n');

    let usersTableExists = false;
    try {
      const tableInfo = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
        .get();
      usersTableExists = !!tableInfo;
    } catch (e) {
      usersTableExists = false;
    }

    console.log('Setting up users table...');
    if (!usersTableExists) {
      db.exec(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'guru',
          mikrotik_comment_id TEXT,
          must_change_password INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('✓ Users table created\n');
    } else {
      const columns = db.prepare('PRAGMA table_info(users)').all();
      const columnNames = columns.map((col) => col.name);

      if (!columnNames.includes('role')) {
        console.log('  Adding role column...');
        db.exec('ALTER TABLE users ADD COLUMN role TEXT');
        db.exec("UPDATE users SET role = 'guru' WHERE role IS NULL");
      }

      if (!columnNames.includes('password_plain')) {
        console.log('  Adding password_plain column (legacy)...');
        db.exec('ALTER TABLE users ADD COLUMN password_plain TEXT');
      }

      if (!columnNames.includes('password_encrypted_viewable')) {
        console.log('  Adding password_encrypted_viewable column...');
        db.exec('ALTER TABLE users ADD COLUMN password_encrypted_viewable TEXT');
      }

      const hasOldComment = columnNames.includes('mikrotik_comment');
      const hasNewComment = columnNames.includes('mikrotik_comment_id');

      if (!hasNewComment) {
        console.log('  Adding mikrotik_comment_id column...');
        db.exec('ALTER TABLE users ADD COLUMN mikrotik_comment_id TEXT');

        if (hasOldComment) {
          console.log('  Migrating data from mikrotik_comment to mikrotik_comment_id...');
          db.exec(
            'UPDATE users SET mikrotik_comment_id = mikrotik_comment WHERE mikrotik_comment IS NOT NULL'
          );
        }
      } else if (hasOldComment) {
        console.log('  Migrating remaining data from mikrotik_comment to mikrotik_comment_id...');
        db.exec(
          'UPDATE users SET mikrotik_comment_id = mikrotik_comment WHERE mikrotik_comment_id IS NULL AND mikrotik_comment IS NOT NULL'
        );
      }

      if (!columnNames.includes('must_change_password')) {
        console.log('  Adding must_change_password column...');
        db.exec('ALTER TABLE users ADD COLUMN must_change_password INTEGER DEFAULT 0');
      }

      console.log('✓ Users table updated\n');
    }

    console.log('Setting up settings table...');
    let settingsTableExists = false;
    try {
      const tableInfo = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'")
        .get();
      settingsTableExists = !!tableInfo;
    } catch (e) {
      settingsTableExists = false;
    }

    if (!settingsTableExists) {
      db.exec(`
        CREATE TABLE settings (
          id INTEGER PRIMARY KEY DEFAULT 1,
          router_ip TEXT NOT NULL DEFAULT '192.168.88.1',
          router_port INTEGER NOT NULL DEFAULT 8728,
          router_user TEXT NOT NULL DEFAULT 'admin',
          router_password_encrypted TEXT NOT NULL DEFAULT '',
          hotspot_dns_name TEXT,
          telegram_bot_token TEXT,
          telegram_chat_id TEXT,
          school_name TEXT NOT NULL DEFAULT 'SMAN 1 CONTOH',
          CHECK (id = 1)
        )
      `);
      console.log('✓ Settings table created\n');
    } else {
      const settingsColumns = db.prepare('PRAGMA table_info(settings)').all();
      const settingsColumnNames = settingsColumns.map((col) => col.name);

      if (
        settingsColumnNames.includes('router_password') &&
        !settingsColumnNames.includes('router_password_encrypted')
      ) {
        console.log('  Migrating router_password to router_password_encrypted...');
        db.exec(
          'ALTER TABLE settings ADD COLUMN router_password_encrypted TEXT NOT NULL DEFAULT ""'
        );
        console.log('  ⚠️  Note: Existing router passwords need to be re-entered and encrypted');
      }
      console.log('✓ Settings table already exists\n');
    }

    console.log('Setting up audit_logs table...');
    let auditLogsTableExists = false;
    try {
      const tableInfo = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='audit_logs'")
        .get();
      auditLogsTableExists = !!tableInfo;
    } catch (e) {
      auditLogsTableExists = false;
    }

    if (!auditLogsTableExists) {
      db.exec(`
        CREATE TABLE audit_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          username TEXT,
          action TEXT NOT NULL,
          details TEXT,
          ip_address TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);
      db.exec('CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id)');
      db.exec('CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at)');
      console.log('✓ Audit logs table created\n');
    } else {
      const auditLogsColumns = db.prepare('PRAGMA table_info(audit_logs)').all();
      const auditLogsColumnNames = auditLogsColumns.map((col) => col.name);

      if (!auditLogsColumnNames.includes('username')) {
        console.log('  Adding username column to audit_logs...');
        db.exec('ALTER TABLE audit_logs ADD COLUMN username TEXT');
        console.log('✓ Audit logs table updated with username column\n');
      } else {
        console.log('✓ Audit logs table already exists\n');
      }
    }

    console.log('Setting up login_attempts table...');
    let loginAttemptsTableExists = false;
    try {
      const tableInfo = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='login_attempts'")
        .get();
      loginAttemptsTableExists = !!tableInfo;
    } catch (e) {
      loginAttemptsTableExists = false;
    }

    if (!loginAttemptsTableExists) {
      try {
        db.exec(`
          CREATE TABLE IF NOT EXISTS login_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            ip_address TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            status TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
          )
        `);
        db.exec('CREATE INDEX IF NOT EXISTS idx_login_attempts_user_id ON login_attempts(user_id)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_login_attempts_timestamp ON login_attempts(timestamp)');
        console.log('✓ Login attempts table created\n');
      } catch (error) {
        console.error('Error creating login_attempts table:', error);
        throw error;
      }
    } else {
      console.log('✓ Login attempts table already exists\n');
    }

    console.log('Verifying settings table schema...');
    const settingsColumns = db.prepare('PRAGMA table_info(settings)').all();
    const settingsColumnNames = settingsColumns.map((col) => col.name);
    let schemaUpdated = false;

    if (!settingsColumnNames.includes('hotspot_dns_name')) {
      console.log('  Adding hotspot_dns_name column to settings...');
      db.exec('ALTER TABLE settings ADD COLUMN hotspot_dns_name TEXT');
      console.log('✓ Settings table updated with hotspot_dns_name');
      schemaUpdated = true;
    }

    if (!settingsColumnNames.includes('telegram_bot_token')) {
      console.log('  Adding telegram_bot_token column to settings...');
      db.exec('ALTER TABLE settings ADD COLUMN telegram_bot_token TEXT');
      console.log('✓ Settings table updated with telegram_bot_token');
      schemaUpdated = true;
    }

    if (!settingsColumnNames.includes('telegram_chat_id')) {
      console.log('  Adding telegram_chat_id column to settings...');
      db.exec('ALTER TABLE settings ADD COLUMN telegram_chat_id TEXT');
      console.log('✓ Settings table updated with telegram_chat_id');
      schemaUpdated = true;
    }

    if (!settingsColumnNames.includes('school_name')) {
      console.log('  Adding school_name column to settings...');
      db.exec("ALTER TABLE settings ADD COLUMN school_name TEXT NOT NULL DEFAULT 'SMAN 1 CONTOH'");
      db.exec("UPDATE settings SET school_name = 'SMAN 1 CONTOH' WHERE school_name IS NULL OR TRIM(school_name) = ''");
      console.log('✓ Settings table updated with school_name');
      schemaUpdated = true;
    }

    if (schemaUpdated) {
      console.log('✓ Settings schema updated successfully\n');
    } else {
      console.log('✓ Settings schema verified (all columns exist)\n');
    }

    const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');

    if (!adminExists) {
      console.log('Creating default admin user...');
      const adminPasswordHash = await bcrypt.hash('admin123', 10);

      const columns = db.prepare('PRAGMA table_info(users)').all();
      const columnNames = columns.map((col) => col.name);

      let insertQuery = 'INSERT INTO users (username, password_hash, role';
      const values = [adminPasswordHash, 'admin'];
      let placeholders = '?, ?';

      if (columnNames.includes('password_plain')) {
        insertQuery += ', password_plain';
        values.push('admin123');
        placeholders += ', ?';
      }

      if (columnNames.includes('mikrotik_comment_id')) {
        insertQuery += ', mikrotik_comment_id';
        values.push(null);
        placeholders += ', ?';
      }

      if (columnNames.includes('mikrotik_comment')) {
        insertQuery += ', mikrotik_comment';
        const commentCol = columns.find((col) => col.name === 'mikrotik_comment');
        values.push(commentCol.notnull ? '' : null);
        placeholders += ', ?';
      }

      insertQuery += `) VALUES (?, ${placeholders})`;
      values.unshift('admin');

      db.prepare(insertQuery).run(...values);

      console.log('✓ Admin user created');
      console.log('  Username: admin');
      console.log('  Password: admin123\n');
    } else {
      const adminUser = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
      if (!adminUser.role || adminUser.role !== 'admin') {
        console.log('  Updating existing admin user role...');
        db.prepare('UPDATE users SET role = ? WHERE username = ?').run('admin', 'admin');
      }
      console.log('✓ Admin user already exists\n');
    }

    const settingsExists = db.prepare('SELECT id FROM settings WHERE id = 1').get();

    if (!settingsExists) {
      console.log('Initializing default router settings...');
      db.prepare(
        `
        INSERT INTO settings (id, router_ip, router_port, router_user, router_password)
        VALUES (1, '192.168.88.1', 8728, 'admin', 'admin')
      `
      ).run();
      console.log('✓ Default settings initialized\n');
    } else {
      console.log('✓ Settings already initialized\n');
    }

    console.log('Database setup completed successfully!');
    console.log('\nDefault Admin Credentials:');
    console.log('  Username: admin');
    console.log('  Password: admin123');
    console.log('\nPlease change the admin password after first login!');
  } catch (error) {
    console.error('Error setting up database:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

// Run setup
setupDatabase();

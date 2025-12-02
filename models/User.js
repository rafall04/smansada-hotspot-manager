const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'hotspot.db');
const db = new Database(dbPath);

class User {
  static findAll() {
    return db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
  }

  static findById(id) {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  }

  static findByUsername(username) {
    return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  }

  static findByComment(comment) {
    const columns = db.prepare('PRAGMA table_info(users)').all();
    const columnNames = columns.map((col) => col.name);

    if (columnNames.includes('mikrotik_comment_id')) {
      return db.prepare('SELECT * FROM users WHERE mikrotik_comment_id = ?').get(comment);
    } else if (columnNames.includes('mikrotik_comment')) {
      return db.prepare('SELECT * FROM users WHERE mikrotik_comment = ?').get(comment);
    }
    return null;
  }

  static create(data) {
    const columns = db.prepare('PRAGMA table_info(users)').all();
    const columnNames = columns.map((col) => col.name);

    const hasCommentId = columnNames.includes('mikrotik_comment_id');
    const hasComment = columnNames.includes('mikrotik_comment');

    const fields = ['username', 'password_hash'];
    const values = [data.username, data.password_hash];

    if (columnNames.includes('password_plain')) {
      fields.push('password_plain');
      values.push(data.password_plain || null);
    }

    if (columnNames.includes('password_encrypted_viewable')) {
      fields.push('password_encrypted_viewable');
      values.push(data.password_encrypted_viewable || null);
    }

    if (columnNames.includes('role')) {
      fields.push('role');
      values.push(data.role || 'guru');
    }

    if (columnNames.includes('must_change_password')) {
      fields.push('must_change_password');
      values.push(data.must_change_password !== undefined ? data.must_change_password : 0);
    }

    const commentValue = data.mikrotik_comment_id || data.mikrotik_comment;

    if (hasCommentId && hasComment) {
      const commentCol = columns.find((col) => col.name === 'mikrotik_comment');

      fields.push('mikrotik_comment_id');
      values.push(commentValue);

      if (commentCol && commentCol.notnull) {
        // If we have a separate comment value (e.g. Name), use it, otherwise fallback to ID
        // In new logic, mikrotik_comment should be the Name
        const realComment = data.mikrotik_comment || commentValue;

        if (!realComment) {
          throw new Error('mikrotik_comment is required but not provided');
        }
        fields.push('mikrotik_comment');
        values.push(realComment);
      }
    } else if (hasCommentId) {
      const commentCol = columns.find((col) => col.name === 'mikrotik_comment_id');
      if (commentCol && commentCol.notnull && !commentValue) {
        throw new Error('mikrotik_comment_id is required but not provided');
      }
      fields.push('mikrotik_comment_id');
      values.push(commentValue);
    } else if (hasComment) {
      const commentCol = columns.find((col) => col.name === 'mikrotik_comment');
      if (commentCol && commentCol.notnull && !commentValue) {
        throw new Error('mikrotik_comment is required but not provided');
      }
      fields.push('mikrotik_comment');
      values.push(commentValue);
    }

    const placeholders = fields.map(() => '?').join(', ');
    const stmt = db.prepare(`INSERT INTO users (${fields.join(', ')}) VALUES (${placeholders})`);
    return stmt.run(...values);
  }

  static update(id, data) {
    const columns = db.prepare('PRAGMA table_info(users)').all();
    const columnNames = columns.map((col) => col.name);

    const fields = [];
    const values = [];

    if (data.username) {
      fields.push('username = ?');
      values.push(data.username);
    }
    if (data.password_hash) {
      fields.push('password_hash = ?');
      values.push(data.password_hash);
    }
    if (data.password_plain !== undefined && columnNames.includes('password_plain')) {
      fields.push('password_plain = ?');
      values.push(data.password_plain);
    }
    if (
      data.password_encrypted_viewable !== undefined &&
      columnNames.includes('password_encrypted_viewable')
    ) {
      fields.push('password_encrypted_viewable = ?');
      values.push(data.password_encrypted_viewable);
    }
    if (data.role && columnNames.includes('role')) {
      fields.push('role = ?');
      values.push(data.role);
    }

    const commentValue = data.mikrotik_comment_id || data.mikrotik_comment;
    if (commentValue !== undefined) {
      if (columnNames.includes('mikrotik_comment_id')) {
        fields.push('mikrotik_comment_id = ?');
        values.push(commentValue);
      } else if (columnNames.includes('mikrotik_comment')) {
        fields.push('mikrotik_comment = ?');
        values.push(commentValue);
      }
    }

    if (fields.length === 0) {
      return null;
    }

    values.push(id);
    const stmt = db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`);
    return stmt.run(...values);
  }

  static delete(id) {
    return db.prepare('DELETE FROM users WHERE id = ?').run(id);
  }

  static countByRole(role) {
    return db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get(role).count;
  }

  static bulkCreate(users) {
    if (!users || users.length === 0) return;

    // Get table info to check for legacy columns
    const columns = db.prepare('PRAGMA table_info(users)').all();
    const columnNames = columns.map((col) => col.name);

    const fields = [
      'username',
      'password_hash',
      'password_plain',
      'password_encrypted_viewable',
      'role',
      'mikrotik_comment_id',
      'must_change_password'
    ];

    // Add legacy mikrotik_comment if it exists
    if (columnNames.includes('mikrotik_comment')) {
      fields.push('mikrotik_comment');
    }

    const placeholders = fields.map((f) => '@' + f).join(', ');
    const insert = db.prepare(`
      INSERT INTO users (${fields.join(', ')})
      VALUES (${placeholders})
    `);

    const insertMany = db.transaction((usersToInsert) => {
      for (const user of usersToInsert) {
        // Prepare user object with all required fields
        const userData = { ...user };

        // Handle legacy column default
        if (columnNames.includes('mikrotik_comment')) {
          // If mikrotik_comment is not provided, use empty string (if NOT NULL) or null
          // We assume empty string is safe for legacy NOT NULL
          userData.mikrotik_comment = user.mikrotik_comment || '';
        }

        insert.run(userData);
      }
    });

    insertMany(users);
  }
}

module.exports = User;

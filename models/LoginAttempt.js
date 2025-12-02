const { getDatabase } = require('./db');

class LoginAttempt {
  static recordAttempt(userId, ipAddress, status = 'FAILED') {
    try {
      const db = getDatabase();
      const stmt = db.prepare(`
        INSERT INTO login_attempts (user_id, ip_address, timestamp, status)
        VALUES (?, ?, strftime('%Y-%m-%d %H:%M:%f', 'now'), ?)
      `);
      const result = stmt.run(userId, ipAddress || 'unknown', status);
      return result.lastInsertRowid;
    } catch (error) {
      if (error.message && error.message.includes('no such table')) {
        console.error('[LoginAttempt] Table login_attempts does not exist. Please run: npm run setup-db');
      } else {
        console.error('[LoginAttempt] Error recording login attempt:', error.message);
      }
      return null;
    }
  }

  static updateStatus(attemptId, status = 'LOCKED') {
    try {
      const db = getDatabase();
      db.prepare('UPDATE login_attempts SET status = ? WHERE id = ?').run(status, attemptId);
    } catch (error) {
      console.error('Error updating login attempt status:', error);
    }
  }

  static getAttemptCount(userId, windowSeconds) {
    try {
      const db = getDatabase();
      const window = `-${windowSeconds} seconds`;
      const row = db
        .prepare(
          `
        SELECT COUNT(*) as count
        FROM login_attempts
        WHERE user_id = ?
          AND status = 'FAILED'
          AND timestamp >= datetime('now', ?)
      `
        )
        .get(userId, window);
      return row ? row.count : 0;
    } catch (error) {
      if (error.message && error.message.includes('no such table')) {
        console.error('[LoginAttempt] Table login_attempts does not exist. Please run: npm run setup-db');
      } else {
        console.error('[LoginAttempt] Error counting login attempts:', error.message);
      }
      return 0;
    }
  }

  static clearAttempts(userId) {
    try {
      const db = getDatabase();
      db.prepare('DELETE FROM login_attempts WHERE user_id = ?').run(userId);
    } catch (error) {
      console.error('Error clearing login attempts:', error);
    }
  }

  static isLockedOut(userId, lockoutSeconds) {
    try {
      const db = getDatabase();
      const row = db
        .prepare(
          `
        SELECT timestamp
        FROM login_attempts
        WHERE user_id = ?
          AND status = 'LOCKED'
        ORDER BY timestamp DESC
        LIMIT 1
      `
        )
        .get(userId);

      if (!row || !row.timestamp) {
        return false;
      }

      const lockedDate = new Date(row.timestamp.replace(' ', 'T') + 'Z');
      const now = Date.now();
      return now - lockedDate.getTime() < lockoutSeconds * 1000;
    } catch (error) {
      if (error.message && error.message.includes('no such table')) {
        console.error('[LoginAttempt] Table login_attempts does not exist. Please run: npm run setup-db');
      } else {
        console.error('[LoginAttempt] Error checking lockout status:', error.message);
      }
      return false;
    }
  }
}

module.exports = LoginAttempt;


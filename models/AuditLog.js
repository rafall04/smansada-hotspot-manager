const { getDatabase } = require('./db');

class AuditLog {
  static findAll(limit = 50) {
    try {
      const db = getDatabase();
      return db
        .prepare(
          `
        SELECT 
          al.*,
          COALESCE(al.username, u.username) as username
        FROM audit_logs al
        LEFT JOIN users u ON al.user_id = u.id
        ORDER BY al.created_at DESC
        LIMIT ?
      `
        )
        .all(limit);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      return [];
    }
  }

  static findByUserId(userId, limit = 50) {
    try {
      const db = getDatabase();
      return db
        .prepare(
          `
        SELECT 
          al.*,
          COALESCE(al.username, u.username) as username
        FROM audit_logs al
        LEFT JOIN users u ON al.user_id = u.id
        WHERE al.user_id = ?
        ORDER BY al.created_at DESC
        LIMIT ?
      `
        )
        .all(userId, limit);
    } catch (error) {
      console.error('Error fetching audit logs by user:', error);
      return [];
    }
  }

  static deleteByUserId(userId) {
    try {
      const db = getDatabase();
      db.prepare('DELETE FROM audit_logs WHERE user_id = ?').run(userId);
    } catch (error) {
      console.error('Error deleting audit logs by user:', error);
    }
  }
}

module.exports = AuditLog;


const { getDatabase } = require('../models/db');

/**
 * Log user activity to audit_logs table
 * @param {Object} req - Express request object
 * @param {string} action - Action type (e.g., 'LOGIN', 'LOGOUT', 'UPDATE_PASSWORD', 'CREATE_USER', 'UPDATE_USER', 'DELETE_USER', 'KICK_SESSION')
 * @param {string} details - Additional details about the action
 */
function logActivity(req, action, details = null) {
  try {
    const db = getDatabase();
    const userId = req.session ? req.session.userId : null;
    const username = req.session ? req.session.username : null;
    const ipAddress = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';

    const stmt = db.prepare(`
      INSERT INTO audit_logs (user_id, username, action, details, ip_address)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(userId, username, action, details, ipAddress);
  } catch (error) {
    console.error('Error logging activity:', error);
  }
}

module.exports = { logActivity };


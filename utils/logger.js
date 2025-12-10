const { getDatabase } = require('../models/db');
const { sendActivityNotification } = require('../services/notificationService');
const User = require('../models/User');
const { getClientIp } = require('./ipHelper');

const MONITORED_ACTIONS = [
  'LOGIN',
  'LOGOUT',
  'CREATE_USER',
  'UPDATE_USER',
  'DELETE_USER',
  'UPDATE_SETTINGS',
  'UPDATE_PASSWORD',
  'KICK_SESSION',
  'BACKUP_DATABASE',
  'RESTORE_DATABASE'
];

function logActivity(req, action, details = null) {
  try {
    const db = getDatabase();
    const userId = req.session ? req.session.userId : null;
    const username = req.session ? req.session.username : null;
    const ipAddress = getClientIp(req);

    const stmt = db.prepare(`
      INSERT INTO audit_logs (user_id, username, action, details, ip_address)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(userId, username, action, details, ipAddress);

    if (MONITORED_ACTIONS.includes(action)) {
      let userRole = null;
      if (userId) {
        try {
          const user = User.findById(userId);
          if (user) {
            userRole = user.role;
          }
        } catch (userError) {
          console.error('[Logger] Error fetching user for notification:', userError.message);
        }
      }

      sendActivityNotification(action, username, userRole, details, ipAddress).catch(err => {
        console.error(`[Logger] Failed to send Telegram notification for ${action}:`, err.message);
      });
    }
  } catch (error) {
    console.error('Error logging activity:', error);
  }
}

module.exports = { logActivity };


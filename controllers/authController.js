const User = require('../models/User');
const bcrypt = require('bcrypt');
const { logActivity } = require('../utils/logger');
const LoginAttempt = require('../models/LoginAttempt');
const {
  sendTelegramMessage,
  escapeHtml,
  sendAccountLockAlert
} = require('../services/notificationService');

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_SECONDS = 15 * 60;
const ATTEMPT_WINDOW_SECONDS = 60 * 60;

class AuthController {
  /**
   * Login Page
   */
  static loginPage(req, res) {
    if (req.session.userId) {
      if (req.session.role === 'admin') {
        return res.redirect('/admin/dashboard');
      }
      return res.redirect('/guru/dashboard');
    }
    res.render('auth/login', {
      title: 'Login',
      error: req.query.error || null,
      lockoutMessage: req.query.lockout || null
    });
  }

  /**
   * Login Handler
   */
  static async login(req, res) {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.render('auth/login', {
          title: 'Login',
          error: 'Username dan password harus diisi',
          lockoutMessage: null
        });
      }

      const user = User.findByUsername(username);

      if (!user) {
        return res.render('auth/login', {
          title: 'Login',
          error: 'Username atau password salah',
          lockoutMessage: null
        });
      }

      const ipAddress =
        req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';

      if (LoginAttempt.isLockedOut(user.id, LOCKOUT_DURATION_SECONDS)) {
        return res.render('auth/login', {
          title: 'Login',
          error: null,
          lockoutMessage: 'Akun terkunci selama 15 menit karena terlalu banyak percobaan gagal.'
        });
      }

      const passwordMatch = await bcrypt.compare(password, user.password_hash);

      if (!passwordMatch) {
        const attemptId = LoginAttempt.recordAttempt(user.id, ipAddress, 'FAILED');
        const attemptCount = LoginAttempt.getAttemptCount(user.id, ATTEMPT_WINDOW_SECONDS);

        if (attemptCount >= MAX_FAILED_ATTEMPTS) {
          if (attemptId) {
            LoginAttempt.updateStatus(attemptId, 'LOCKED');
          }
          sendAccountLockAlert(user.username, ipAddress);
          return res.render('auth/login', {
            title: 'Login',
            error: null,
            lockoutMessage: 'Akun terkunci selama 15 menit karena terlalu banyak percobaan gagal.'
          });
        }

        return res.render('auth/login', {
          title: 'Login',
          error: 'Username atau password salah',
          lockoutMessage: null
        });
      }

      LoginAttempt.clearAttempts(user.id);

      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.role = user.role;

      logActivity(req, 'LOGIN', `User: ${user.username}`);

      const currentTime = new Date().toLocaleString('id-ID', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      const roleEmoji = user.role === 'admin' ? '👑' : '👤';
      const loginMessage = `🔐 <b>Login Alert</b>

<b>User:</b> ${roleEmoji} <code>${escapeHtml(user.username)}</code>
<b>Role:</b> <b>${escapeHtml(user.role.toUpperCase())}</b>
<b>IP Address:</b> <code>${escapeHtml(ipAddress)}</code>
<b>Time:</b> <code>${escapeHtml(currentTime)}</code>

<i>Mikrotik Hotspot Manager</i>`;

      sendTelegramMessage(loginMessage).catch(err => {
        console.error('[Telegram] Notification error:', err.message);
      });

      if (user.role === 'admin') {
        return res.redirect('/admin/dashboard');
      }

      if (user.must_change_password === 1) {
        req.session.mustChangePassword = true;
        return res.redirect('/guru/initial-password-change');
      }

      return res.redirect('/guru/dashboard');
    } catch (error) {
      console.error('Login error:', error);
      res.render('auth/login', {
        title: 'Login',
        error: 'Terjadi kesalahan saat login'
      });
    }
  }

  /**
   * Logout Handler
   */
  static logout(req, res) {
    const username = req.session ? req.session.username : 'unknown';
    logActivity(req, 'LOGOUT', `User: ${username}`);

    const currentTime = new Date().toLocaleString('id-ID', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const logoutMessage = `👋 <b>Logout Alert</b>

<b>User:</b> <code>${escapeHtml(username)}</code> has logged out.
<b>Time:</b> <code>${escapeHtml(currentTime)}</code>

<i>Mikrotik Hotspot Manager</i>`;

    sendTelegramMessage(logoutMessage).catch(err => {
      console.error('[Telegram] Notification error:', err.message);
    });

    req.session.destroy((err) => {
      if (err) {
        console.error('Logout error:', err);
      }
      res.redirect('/login');
    });
  }
}

module.exports = AuthController;

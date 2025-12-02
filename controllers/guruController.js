const { validationResult } = require('express-validator');
const User = require('../models/User');
const Settings = require('../models/Settings');
const MikrotikService = require('../services/mikrotikService');
const bcrypt = require('bcrypt');
const { logActivity } = require('../utils/logger');

/**
 * Helper function to format bytes to human readable format
 */
function formatBytes(bytes) {
  if (!bytes || bytes === '0' || bytes === 0) {
    return '0 B';
  }

  const bytesNum = parseInt(bytes);
  if (isNaN(bytesNum)) {
    return bytes;
  }

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytesNum) / Math.log(k));

  return (Math.round((bytesNum / Math.pow(k, i)) * 100) / 100).toFixed(2) + ' ' + sizes[i];
}

function respondGuruValidationErrors(req, res, redirectPath) {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return null;
  }
  const payload = {
    success: false,
    validationErrors: errors.array()
  };
  if (req.headers.accept && req.headers.accept.includes('application/json')) {
    return res.status(400).json(payload);
  }
  if (redirectPath) {
    const message = encodeURIComponent(errors.array().map((err) => err.msg).join(', '));
    return res.redirect(`${redirectPath}?error=${message}`);
  }
  return res.status(400).json(payload);
}

class GuruController {
  /**
   * Dashboard Guru
   */
  static async dashboard(req, res) {
    try {
      const user = User.findById(req.session.userId);

      if (!user || !user.mikrotik_comment_id) {
        return res.render('guru/dashboard', {
          title: 'Dashboard',
          hotspotUser: null,
          activeSessions: [],
          error: 'Mikrotik Comment ID tidak ditemukan. Hubungi admin.',
          success: req.query.success || null
        });
      }

      let hotspotUser = null;
      let activeSessions = [];
      let deviceQuota = null;
      let error = null;

      try {
        hotspotUser = await MikrotikService.getHotspotUserByComment(user.mikrotik_comment_id);

        if (hotspotUser) {
          activeSessions = await MikrotikService.getAllActiveSessions(hotspotUser.name);

          activeSessions = activeSessions.map((session) => ({
            ...session,
            'bytes-in-formatted': formatBytes(session['bytes-in'] || '0'),
            'bytes-out-formatted': formatBytes(session['bytes-out'] || '0')
          }));

          deviceQuota = await MikrotikService.getDeviceQuota(hotspotUser.name);
        } else {
          error =
            'User hotspot tidak ditemukan di Mikrotik dengan Comment ID: ' +
            user.mikrotik_comment_id;
        }
      } catch (mikrotikError) {
        console.error('Mikrotik error:', mikrotikError);
        error = 'Gagal terhubung ke Mikrotik: ' + mikrotikError.message;
      }

      const settings = Settings.get();
      const hotspotDnsName = settings.hotspot_dns_name || settings.router_ip || '192.168.88.1';
      let hotspotLoginUrl = null;

      if (hotspotUser) {
        const loginUrl = `http://${hotspotDnsName}/login?username=${encodeURIComponent(hotspotUser.name)}&password=${encodeURIComponent(hotspotUser.password || '')}`;
        hotspotLoginUrl = loginUrl;
      }

      res.render('guru/dashboard', {
        title: 'Dashboard',
        hotspotUser,
        activeSessions,
        hotspotLoginUrl,
        deviceQuota: deviceQuota,
        error: error || req.query.error || null,
        success: req.query.success || null
      });
    } catch (error) {
      console.error('Dashboard error:', error);
      res.render('guru/dashboard', {
        title: 'Dashboard',
        hotspotUser: null,
        activeSessions: [],
        error: 'Terjadi kesalahan: ' + error.message,
        success: null
      });
    }
  }

  /**
   * Update Hotspot Credentials
   */
  static async updateHotspotCredentials(req, res) {
    try {
      const validationResponse = respondGuruValidationErrors(req, res, '/guru/dashboard');
      if (validationResponse) {
        return validationResponse;
      }

      const rawUsername = req.body.username;
      const rawPassword = req.body.password;

      const sanitizedUsername =
        rawUsername && rawUsername.trim() !== '' ? rawUsername.trim() : '';
      const sanitizedPassword =
        rawPassword && rawPassword.trim() !== '' ? rawPassword.trim() : '';

      if (!sanitizedUsername && !sanitizedPassword) {
        return res.redirect(
          '/guru/dashboard?error=' + encodeURIComponent('Isi minimal salah satu kolom untuk diperbarui')
        );
      }

      const user = User.findById(req.session.userId);

      if (!user || !user.mikrotik_comment_id) {
        return res.redirect('/guru/dashboard?error=Mikrotik Comment ID tidak ditemukan');
      }

      const hotspotUser = await MikrotikService.getHotspotUserByComment(user.mikrotik_comment_id);

      if (!hotspotUser) {
        return res.redirect('/guru/dashboard?error=User hotspot tidak ditemukan di Mikrotik');
      }

      const currentUsername = hotspotUser.name || '';
      const currentPassword = hotspotUser.password || '';

      const finalUsername = sanitizedUsername || currentUsername;
      const finalPassword = sanitizedPassword || currentPassword;

      if (finalUsername === currentUsername && finalPassword === currentPassword) {
        return res.redirect(
          '/guru/dashboard?success=' + encodeURIComponent('Info: Tidak ada perubahan data yang dilakukan.')
        );
      }

      await MikrotikService.updateHotspotUser(
        hotspotUser['.id'],
        finalUsername,
        finalPassword,
        user.mikrotik_comment_id
      );

      logActivity(req, 'UPDATE_PASSWORD', `Hotspot username: ${finalUsername}`);

      try {
        await MikrotikService.kickActiveUser(finalUsername);
      } catch (kickError) {
        console.error('Kick session error (non-critical):', kickError);
      }

      res.redirect(
        '/guru/dashboard?success=' +
        encodeURIComponent('Kredensial hotspot berhasil diperbarui. Silakan gunakan data terbaru untuk login.')
      );
    } catch (error) {
      console.error('Update password error:', error);
      res.redirect('/guru/dashboard?error=' + encodeURIComponent(error.message));
    }
  }

  /**
   * Settings Page for Guru
   */
  static settingsPage(req, res) {
    try {
      const user = User.findById(req.session.userId);

      res.render('guru/settings', {
        title: 'Pengaturan Akun',
        user,
        error: req.query.error || null,
        success: req.query.success || null
      });
    } catch (error) {
      console.error('Settings page error:', error);
      res.render('guru/settings', {
        title: 'Pengaturan Akun',
        user: null,
        error: 'Gagal memuat data user',
        success: null
      });
    }
  }

  /**
   * Update User Settings (Username & Password Web)
   */
  static async updateSettings(req, res) {
    try {
      const { username, password, password_confirm } = req.body;

      if (!username) {
        return res.redirect('/guru/settings?error=Username harus diisi');
      }

      const user = User.findById(req.session.userId);

      if (!user) {
        return res.redirect('/guru/settings?error=User tidak ditemukan');
      }

      const updateData = { username };

      const existingUser = User.findByUsername(username);
      if (existingUser && existingUser.id !== user.id) {
        return res.redirect('/guru/settings?error=Username sudah digunakan');
      }

      if (password) {
        if (password !== password_confirm) {
          return res.redirect('/guru/settings?error=Password dan konfirmasi password tidak sama');
        }
        updateData.password_hash = await bcrypt.hash(password, 10);
        updateData.password_plain = password;
        const cryptoHelper = require('../utils/cryptoHelper');
        updateData.password_encrypted_viewable = cryptoHelper.encrypt(password);
      }

      User.update(user.id, updateData);

      res.redirect('/guru/settings?success=Pengaturan berhasil diperbarui');
    } catch (error) {
      console.error('Update settings error:', error);
      res.redirect('/guru/settings?error=Gagal memperbarui pengaturan: ' + error.message);
    }
  }

  /**
   * Update Web Account (Username & Password for Web Login)
   * API endpoint for modal form
   */
  static async updateWebAccount(req, res) {
    try {
      const { username, password } = req.body;

      const isApiRequest = req.headers.accept && req.headers.accept.includes('application/json');

      if (!username) {
        const errorMsg = 'Username harus diisi';
        if (isApiRequest) {
          return res.status(400).json({ success: false, message: errorMsg });
        }
        return res.redirect('/guru/dashboard?error=' + encodeURIComponent(errorMsg));
      }

      const user = User.findById(req.session.userId);

      if (!user) {
        const errorMsg = 'User tidak ditemukan';
        if (isApiRequest) {
          return res.status(404).json({ success: false, message: errorMsg });
        }
        return res.redirect('/guru/dashboard?error=' + encodeURIComponent(errorMsg));
      }

      const updateData = { username };

      const existingUser = User.findByUsername(username);
      if (existingUser && existingUser.id !== user.id) {
        const errorMsg = 'Username sudah digunakan';
        if (isApiRequest) {
          return res.status(409).json({ success: false, message: errorMsg });
        }
        return res.redirect('/guru/dashboard?error=' + encodeURIComponent(errorMsg));
      }

      if (password && password.trim() !== '') {
        if (password.length < 6) {
          const errorMsg = 'Password minimal 6 karakter';
          if (isApiRequest) {
            return res.status(400).json({ success: false, message: errorMsg });
          }
          return res.redirect('/guru/dashboard?error=' + encodeURIComponent(errorMsg));
        }

        updateData.password_hash = await bcrypt.hash(password, 10);
        updateData.password_plain = password;
        const cryptoHelper = require('../utils/cryptoHelper');
        updateData.password_encrypted_viewable = cryptoHelper.encrypt(password);
      }

      try {
        User.update(user.id, updateData);
      } catch (dbError) {
        let errorMsg = 'Gagal memperbarui akun';
        if (dbError.message && dbError.message.includes('UNIQUE')) {
          if (dbError.message.includes('username')) {
            errorMsg = 'Username sudah digunakan';
          }
        } else {
          errorMsg = dbError.message || errorMsg;
        }

        if (isApiRequest) {
          return res.status(500).json({ success: false, message: errorMsg });
        }
        return res.redirect('/guru/dashboard?error=' + encodeURIComponent(errorMsg));
      }

      const successMsg = 'Akun berhasil diperbarui';
      if (isApiRequest) {
        return res.status(200).json({ success: true, message: successMsg });
      }
      res.redirect('/guru/dashboard?success=' + encodeURIComponent(successMsg));
    } catch (error) {
      console.error('Update web account error:', error);
      const errorMsg = 'Gagal memperbarui akun: ' + (error.message || 'Unknown error');

      const isApiRequest = req.headers.accept && req.headers.accept.includes('application/json');
      if (isApiRequest) {
        return res.status(500).json({ success: false, message: errorMsg });
      }
      res.redirect('/guru/dashboard?error=' + encodeURIComponent(errorMsg));
    }
  }

  /**
   * Kick Active Session
   */
  static async kickSession(req, res) {
    try {
      const user = User.findById(req.session.userId);

      if (!user || !user.mikrotik_comment_id) {
        return res.redirect('/guru/dashboard?error=Mikrotik Comment ID tidak ditemukan');
      }

      const hotspotUser = await MikrotikService.getHotspotUserByComment(user.mikrotik_comment_id);

      if (!hotspotUser) {
        return res.redirect('/guru/dashboard?error=User hotspot tidak ditemukan di Mikrotik');
      }

      await MikrotikService.kickActiveUser(hotspotUser.name);

      logActivity(req, 'KICK_SESSION', `Hotspot username: ${hotspotUser.name}, All sessions`);

      res.redirect('/guru/dashboard?success=Koneksi berhasil direset');
    } catch (error) {
      console.error('Kick session error:', error);
      res.redirect('/guru/dashboard?error=' + encodeURIComponent(error.message));
    }
  }

  /**
   * Kick specific session by session ID
   */
  static async kickSessionById(req, res) {
    try {
      const { sessionId } = req.params;
      const user = User.findById(req.session.userId);

      if (!user || !user.mikrotik_comment_id) {
        return res.status(400).json({
          success: false,
          message: 'Mikrotik Comment ID tidak ditemukan'
        });
      }

      const hotspotUser = await MikrotikService.getHotspotUserByComment(user.mikrotik_comment_id);

      if (!hotspotUser) {
        return res.status(404).json({
          success: false,
          message: 'User hotspot tidak ditemukan di Mikrotik'
        });
      }

      await MikrotikService.kickSessionById(sessionId, hotspotUser.name);

      logActivity(req, 'KICK_SESSION', `Session ID: ${sessionId}, Hotspot username: ${hotspotUser.name}`);

      return res.json({
        success: true,
        message: 'Session berhasil dihapus'
      });
    } catch (error) {
      console.error('Kick session by ID error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Gagal memutus koneksi'
      });
    }
  }
  /**
   * Initial Password Change Page
   */
  static initialPasswordChangePage(req, res) {
    // Prevent access if not required
    // We need to check DB again to be sure, or rely on session
    const user = User.findById(req.session.userId);
    if (!user || user.must_change_password !== 1) {
      return res.redirect('/guru/dashboard');
    }

    res.render('guru/change_password_first_login', {
      error: req.query.error || null
    });
  }

  /**
   * Update Initial Password
   */
  static async updateInitialPassword(req, res) {
    try {
      const { password, password_confirm } = req.body;
      const user = User.findById(req.session.userId);

      if (!user || user.must_change_password !== 1) {
        return res.redirect('/guru/dashboard');
      }

      if (!password || password.length < 6) {
        return res.render('guru/change_password_first_login', {
          error: 'Password minimal 6 karakter'
        });
      }

      if (password !== password_confirm) {
        return res.render('guru/change_password_first_login', {
          error: 'Konfirmasi password tidak cocok'
        });
      }

      // Update DB
      const passwordHash = await bcrypt.hash(password, 10);
      const cryptoHelper = require('../utils/cryptoHelper');
      const passwordEncrypted = cryptoHelper.encrypt(password);

      User.update(user.id, {
        password_hash: passwordHash,
        password_plain: password,
        password_encrypted_viewable: passwordEncrypted,
        must_change_password: 0
      });

      // Update Mikrotik
      if (user.mikrotik_comment_id) {
        try {
          const hotspotUser = await MikrotikService.getHotspotUserByComment(user.mikrotik_comment_id);
          if (hotspotUser) {
            // Update Mikrotik Password
            // Note: updateHotspotUser takes (mikrotikId, username, password, commentId)
            // We keep username same, update password
            await MikrotikService.updateHotspotUser(
              hotspotUser['.id'],
              hotspotUser.name,
              password,
              user.mikrotik_comment_id
            );

            // Kick active sessions to force re-login with new password
            await MikrotikService.kickActiveUser(hotspotUser.name);
          }
        } catch (mtError) {
          console.error('Failed to sync password to Mikrotik:', mtError);
          // We continue even if Mikrotik sync fails? 
          // Ideally we should warn, but user is already updated in DB.
          // Let's just log it.
        }
      }

      // Update Session
      req.session.mustChangePassword = false;

      res.redirect('/guru/dashboard?success=' + encodeURIComponent('Password berhasil diubah. Selamat datang!'));

    } catch (error) {
      console.error('Initial password update error:', error);
      res.render('guru/change_password_first_login', {
        error: 'Terjadi kesalahan: ' + error.message
      });
    }
  }
}

module.exports = GuruController;

const { validationResult } = require('express-validator');
const User = require('../models/User');
const Settings = require('../models/Settings');
const MikrotikService = require('../services/mikrotikService');
const bcrypt = require('bcrypt');
const { logActivity } = require('../utils/logger');

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
  static async dashboard(req, res) {
    if (res.headersSent) return;
    
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

      const settings = Settings.get();
      const hotspotDnsName = settings.hotspot_dns_name || settings.router_ip || '192.168.88.1';

      if (res.headersSent) return;
      
      return res.render('guru/dashboard', {
        title: 'Dashboard',
        hotspotUser: null,
        activeSessions: [],
        hotspotLoginUrl: null,
        deviceQuota: null,
        mikrotikCommentId: user.mikrotik_comment_id,
        hotspotDnsName: hotspotDnsName,
        error: req.query.error || null,
        success: req.query.success || null
      });
    } catch (error) {
      if (res.headersSent) return;
      
      const executionContext = {
        user: process.env.USER || 'unknown',
        cwd: process.cwd(),
        nodeVersion: process.version,
        timestamp: new Date().toISOString(),
        errorCode: error.code,
        errorMessage: error.message
      };
      
      console.error('[GuruDashboard] CRITICAL ERROR:', {
        message: error.message,
        code: error.code,
        stack: error.stack,
        context: executionContext
      });
      
      return res.render('guru/dashboard', {
        title: 'Dashboard',
        hotspotUser: null,
        activeSessions: [],
        error: 'Terjadi kesalahan: ' + error.message,
        success: null
      });
    }
  }

  static async updateHotspotCredentials(req, res) {
    if (res.headersSent) return;
    
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

      if (res.headersSent) return;
      
      return res.redirect(
        '/guru/dashboard?success=' +
        encodeURIComponent('Kredensial hotspot berhasil diperbarui. Silakan gunakan data terbaru untuk login.')
      );
    } catch (error) {
      if (res.headersSent) return;
      
      const executionContext = {
        user: process.env.USER || 'unknown',
        cwd: process.cwd(),
        nodeVersion: process.version,
        timestamp: new Date().toISOString(),
        errorCode: error.code,
        errorMessage: error.message
      };
      
      console.error('[UpdateHotspotCredentials] CRITICAL ERROR:', {
        message: error.message,
        code: error.code,
        stack: error.stack,
        context: executionContext
      });
      
      return res.redirect('/guru/dashboard?error=' + encodeURIComponent(error.message));
    }
  }

  static settingsPage(req, res) {
    if (res.headersSent) return;
    
    try {
      const user = User.findById(req.session.userId);

      return res.render('guru/settings', {
        title: 'Pengaturan Akun',
        user,
        error: req.query.error || null,
        success: req.query.success || null
      });
    } catch (error) {
      if (res.headersSent) return;
      
      console.error('[GuruSettingsPage] Error:', error);
      return res.render('guru/settings', {
        title: 'Pengaturan Akun',
        user: null,
        error: 'Gagal memuat data user',
        success: null
      });
    }
  }

  static async updateSettings(req, res) {
    if (res.headersSent) return;
    
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
      
      if (res.headersSent) return;

      return res.redirect('/guru/settings?success=Pengaturan berhasil diperbarui');
    } catch (error) {
      if (res.headersSent) return;
      
      console.error('[UpdateSettings] Error:', error);
      return res.redirect('/guru/settings?error=Gagal memperbarui pengaturan: ' + error.message);
    }
  }

  static async updateWebAccount(req, res) {
    if (res.headersSent) return;
    
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
      
      if (res.headersSent) return;
      return res.redirect('/guru/dashboard?success=' + encodeURIComponent(successMsg));
    } catch (error) {
      if (res.headersSent) return;
      
      const executionContext = {
        user: process.env.USER || 'unknown',
        cwd: process.cwd(),
        nodeVersion: process.version,
        timestamp: new Date().toISOString(),
        errorCode: error.code,
        errorMessage: error.message
      };
      
      console.error('[UpdateWebAccount] CRITICAL ERROR:', {
        message: error.message,
        code: error.code,
        stack: error.stack,
        context: executionContext
      });
      
      const errorMsg = 'Gagal memperbarui akun: ' + (error.message || 'Unknown error');

      const isApiRequest = req.headers.accept && req.headers.accept.includes('application/json');
      if (isApiRequest) {
        return res.status(500).json({ success: false, message: errorMsg });
      }
      return res.redirect('/guru/dashboard?error=' + encodeURIComponent(errorMsg));
    }
  }

  static async kickSession(req, res) {
    if (res.headersSent) return;
    
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

      if (res.headersSent) return;
      return res.redirect('/guru/dashboard?success=Koneksi berhasil direset');
    } catch (error) {
      if (res.headersSent) return;
      
      console.error('[KickSession] Error:', error);
      return res.redirect('/guru/dashboard?error=' + encodeURIComponent(error.message));
    }
  }

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
  static initialPasswordChangePage(req, res) {
    const user = User.findById(req.session.userId);
    if (!user || user.must_change_password !== 1) {
      return res.redirect('/guru/dashboard');
    }

    return res.render('guru/change_password_first_login', {
      error: req.query.error || null
    });
  }

  static async updateInitialPassword(req, res) {
    if (res.headersSent) return;
    
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

      const passwordHash = await bcrypt.hash(password, 10);
      const cryptoHelper = require('../utils/cryptoHelper');
      const passwordEncrypted = cryptoHelper.encrypt(password);

      // Update password in database ONLY (NOT in Mikrotik)
      // Password change is only for web application access, not for Mikrotik hotspot
      User.update(user.id, {
        password_hash: passwordHash,
        password_plain: password,
        password_encrypted_viewable: passwordEncrypted,
        must_change_password: 0
      });

      // Verify the update was successful by re-fetching the user
      const updatedUser = User.findById(user.id);
      
      // Log for debugging
      console.log(`[UpdateInitialPassword] User ${user.id} (${user.username}) - Before update: must_change_password = ${user.must_change_password}`);
      console.log(`[UpdateInitialPassword] User ${user.id} (${user.username}) - After update: must_change_password = ${updatedUser ? updatedUser.must_change_password : 'null'}`);
      console.log(`[UpdateInitialPassword] User ${user.id} (${user.username}) - Type check: ${updatedUser ? typeof updatedUser.must_change_password : 'null'}`);
      
      // Check if update was successful (handle both integer 0 and boolean false)
      const isPasswordChangeComplete = updatedUser && (
        updatedUser.must_change_password === 0 || 
        updatedUser.must_change_password === false ||
        updatedUser.must_change_password === '0'
      );
      
      if (isPasswordChangeComplete) {
        // Successfully updated - clear session flag
        req.session.mustChangePassword = false;
        console.log(`[UpdateInitialPassword] ✓ Password changed successfully for user ${user.id} (${user.username}), must_change_password reset to 0`);
      } else {
        // Update failed - log error with details
        console.error(`[UpdateInitialPassword] ✗ Warning: must_change_password was not reset properly`);
        console.error(`[UpdateInitialPassword]   User ID: ${user.id}, Username: ${user.username}`);
        console.error(`[UpdateInitialPassword]   Updated user exists: ${!!updatedUser}`);
        console.error(`[UpdateInitialPassword]   must_change_password value: ${updatedUser ? updatedUser.must_change_password : 'N/A'}, type: ${updatedUser ? typeof updatedUser.must_change_password : 'N/A'}`);
        req.session.mustChangePassword = false; // Clear session flag anyway to prevent loop
      }

      // Save session to ensure mustChangePassword flag is persisted
      req.session.save((err) => {
        if (err) {
          console.error('[UpdateInitialPassword] Session save error:', err.message);
        }
      });

      if (res.headersSent) return;
      return res.redirect('/guru/dashboard?success=' + encodeURIComponent('Password berhasil diubah. Selamat datang!'));

    } catch (error) {
      if (res.headersSent) return;
      
      const executionContext = {
        user: process.env.USER || 'unknown',
        cwd: process.cwd(),
        nodeVersion: process.version,
        timestamp: new Date().toISOString(),
        errorCode: error.code,
        errorMessage: error.message
      };
      
      console.error('[UpdateInitialPassword] CRITICAL ERROR:', {
        message: error.message,
        code: error.code,
        stack: error.stack,
        context: executionContext
      });
      
      return res.render('guru/change_password_first_login', {
        error: 'Terjadi kesalahan: ' + error.message
      });
    }
  }

  static async getDashboardData(req, res) {
    if (res.headersSent) return;

    try {
      const user = User.findById(req.session.userId);

      if (!user || !user.mikrotik_comment_id) {
        return res.json({
          success: false,
          message: 'Mikrotik Comment ID tidak ditemukan',
          data: {
            hotspotUser: null,
            activeSessions: [],
            deviceQuota: null,
            hotspotLoginUrl: null
          }
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
          error = 'User hotspot tidak ditemukan di Mikrotik dengan Comment ID: ' + user.mikrotik_comment_id;
        }
      } catch (mikrotikError) {
        console.error('[GuruDashboardData] Mikrotik error:', mikrotikError);
        error = 'Gagal terhubung ke Mikrotik: ' + mikrotikError.message;
      }

      const settings = Settings.get();
      const hotspotDnsName = settings.hotspot_dns_name || settings.router_ip || '192.168.88.1';
      let hotspotLoginUrl = null;

      if (hotspotUser) {
        const loginUrl = `http://${hotspotDnsName}/login?username=${encodeURIComponent(hotspotUser.name)}&password=${encodeURIComponent(hotspotUser.password || '')}`;
        hotspotLoginUrl = loginUrl;
      }

      if (res.headersSent) return;

      return res.json({
        success: true,
        data: {
          hotspotUser,
          activeSessions,
          hotspotLoginUrl,
          deviceQuota,
          error
        }
      });
    } catch (error) {
      if (res.headersSent) return;

      console.error('[GuruDashboardData] CRITICAL ERROR:', error);

      return res.status(500).json({
        success: false,
        message: error.message || 'Gagal memuat data dashboard',
        data: {
          hotspotUser: null,
          activeSessions: [],
          deviceQuota: null,
          hotspotLoginUrl: null,
          error: 'Terjadi kesalahan: ' + error.message
        }
      });
    }
  }
}

module.exports = GuruController;

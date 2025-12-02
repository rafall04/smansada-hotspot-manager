const { validationResult } = require('express-validator');
const User = require('../models/User');
const Settings = require('../models/Settings');
const MikrotikService = require('../services/mikrotikService');
const bcrypt = require('bcrypt');
const cryptoHelper = require('../utils/cryptoHelper');
const { logActivity } = require('../utils/logger');
const formatter = require('../utils/formatter');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '..', 'hotspot.db');
const dashboardDb = new Database(dbPath);
const ACTION_OPTIONS = ['LOGIN', 'LOGOUT', 'UPDATE_SETTINGS', 'DELETE_USER', 'CREATE_USER', 'KICK_SESSION'];

function respondValidationErrors(req, res, redirectPath) {
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
    const message = errors.array().map((err) => err.msg).join(', ');
    req.flash('error', message);
    return res.redirect(redirectPath);
  }
  return res.status(400).json(payload);
}

class AdminController {
  /**
   * Dashboard Admin with Real-time Monitoring
   */
  static async dashboard(req, res) {
    try {
      const searchQuery = req.query.search ? req.query.search.trim() : '';
      let actionFilter = req.query.action_type ? req.query.action_type.trim().toUpperCase() : '';
      if (actionFilter && !ACTION_OPTIONS.includes(actionFilter)) {
        actionFilter = '';
      }

      let connectionTest = { success: false, message: 'Router offline' };
      try {
        connectionTest = await MikrotikService.testConnection();
      } catch (error) {
        console.error('Connection test failed:', error.message);
      }

      const totalGuru = User.countByRole('guru');
      const allUsers = User.findAll().filter((u) => u.role === 'guru');

      let systemResources = null;
      let allActiveSessions = [];
      let usersWithSessions = [];

      if (connectionTest.success) {
        try {
          systemResources = await MikrotikService.getSystemResources();
          allActiveSessions = await MikrotikService.getAllActiveHotspotSessions();

          const sessionMap = new Map();
          const usernameToCommentMap = new Map();

          const uniqueUsernames = [
            ...new Set(allActiveSessions.map((s) => s.user).filter(Boolean))
          ];

          for (const username of uniqueUsernames) {
            try {
              const hotspotUser = await MikrotikService.getHotspotUserByUsername(username);
              if (hotspotUser && hotspotUser.comment) {
                usernameToCommentMap.set(username, hotspotUser.comment);
              }
            } catch (error) {
              console.error(`Error fetching user ${username}:`, error);
            }
          }

          for (const session of allActiveSessions) {
            const username = session.user || '';
            if (!username) {
              continue;
            }

            const commentId = usernameToCommentMap.get(username);
            if (!commentId) {
              continue;
            }

            if (!sessionMap.has(commentId)) {
              sessionMap.set(commentId, []);
            }

            sessionMap.get(commentId).push({
              ip: session['address'] || 'N/A',
              mac: session['mac-address'] || 'N/A',
              uptime: session.uptime || '0s',
              username
            });
          }

          usersWithSessions = allUsers.map((user) => {
            try {
              const commentId = user.mikrotik_comment_id;
              const sessions = sessionMap.get(commentId) || [];

              let longestUptime = '0s';
              if (sessions.length > 0) {
                const uptimes = sessions.map((s) => {
                  const uptimeStr = s.uptime || '0s';
                  return formatter.parseUptimeToSeconds(uptimeStr);
                }).filter(s => !isNaN(s) && s >= 0);
                if (uptimes.length > 0) {
                  const maxSeconds = Math.max(...uptimes);
                  longestUptime = formatter.formatUptime(maxSeconds);
                }
              }

              return {
                id: user.id,
                username: user.username,
                commentId: commentId || '-',
                status: sessions.length > 0 ? 'online' : 'offline',
                activeDevices: sessions.length,
                sessions,
                uptime: longestUptime
              };
            } catch (error) {
              console.error(`Error processing user ${user.id}:`, error);
              return {
                id: user.id,
                username: user.username,
                commentId: user.mikrotik_comment_id || '-',
                status: 'offline',
                activeDevices: 0,
                sessions: [],
                uptime: '0s'
              };
            }
          });
        } catch (error) {
          console.error('Error fetching Mikrotik data:', error);
          usersWithSessions = allUsers.map((user) => ({
            id: user.id,
            username: user.username,
            commentId: user.mikrotik_comment_id || '-',
            status: 'offline',
            activeDevices: 0,
            sessions: [],
            uptime: '0s'
          }));
        }
      } else {
        usersWithSessions = allUsers.map((user) => ({
          id: user.id,
          username: user.username,
          commentId: user.mikrotik_comment_id || '-',
          status: 'offline',
          activeDevices: 0,
          sessions: [],
          uptime: '0s'
        }));
      }

      const totalActiveConnections = allActiveSessions.length;
      const systemHealth = systemResources
        ? {
          totalMemory: systemResources['total-memory'] || 0,
          freeMemory: systemResources['free-memory'] || 0,
          usedMemory: 0,
          memoryPercent: 0
        }
        : null;

      if (systemHealth && systemHealth.totalMemory > 0) {
        systemHealth.usedMemory = systemHealth.totalMemory - systemHealth.freeMemory;
        systemHealth.memoryPercent = Math.round(
          (systemHealth.usedMemory / systemHealth.totalMemory) * 100
        );
      }

      res.render('admin/dashboard', {
        title: 'Admin Dashboard',
        connectionTest,
        totalGuru,
        systemResources,
        totalActiveConnections,
        systemHealth,
        usersWithSessions,
        auditLogs: [],
        session: req.session || {},
        error: req.query.error || null,
        success: req.query.success || null,
        searchQuery,
        actionFilter,
        actionOptions: ACTION_OPTIONS
      });
    } catch (error) {
      console.error('Dashboard error:', error);

      res.render('admin/dashboard', {
        title: 'Admin Dashboard',
        connectionTest: { success: false, message: 'Error: ' + error.message },
        totalGuru: 0,
        systemResources: null,
        totalActiveConnections: 0,
        systemHealth: null,
        usersWithSessions: [],
        auditLogs: [],
        session: req.session || {},
        error: 'Terjadi kesalahan: ' + error.message,
        success: null
      });
    }
  }

  /**
   * Router Settings Page
   */
  static async settingsPage(req, res) {
    try {
      const settings = Settings.get();

      let displayPassword = '';
      if (settings.router_password_encrypted && settings.router_password_encrypted.trim() !== '') {
        try {
          displayPassword = cryptoHelper.decrypt(settings.router_password_encrypted);
        } catch (error) {
          displayPassword = settings.router_password_encrypted;
        }
      } else if (settings.router_password) {
        displayPassword = settings.router_password;
      }

      const settingsWithPassword = {
        ...settings,
        router_password: displayPassword,
        telegram_bot_token: settings.telegram_bot_token || '',
        telegram_chat_id: settings.telegram_chat_id || '',
        hotspot_dns_name: settings.hotspot_dns_name || ''
      };

      res.render('admin/settings', {
        title: 'Router Settings',
        settings: settingsWithPassword,
        error: req.query.error || null,
        success: req.query.success || null
      });
    } catch (error) {
      console.error('Settings page error:', error);
      res.render('admin/settings', {
        title: 'Router Settings',
        settings: {
          router_ip: '192.168.88.1',
          router_port: 8728,
          router_user: 'admin',
          router_password: '',
          telegram_bot_token: '',
          telegram_chat_id: '',
          hotspot_dns_name: ''
        },
        error: req.query.error || null,
        success: req.query.success || null
      });
    }
  }

  /**
   * Update Router Settings
   */
  static async updateSettings(req, res) {
    try {
      const validationResponse = respondValidationErrors(req, res, '/admin/settings');
      if (validationResponse) {
        return validationResponse;
      }

      const { router_ip, router_port, router_user, router_password } = req.body;

      const currentSettings = Settings.get();
      let routerPasswordEncrypted = currentSettings.router_password_encrypted || '';

      if (router_password && router_password.trim() !== '') {
        routerPasswordEncrypted = cryptoHelper.encrypt(router_password);
      } else if (!routerPasswordEncrypted || routerPasswordEncrypted.trim() === '') {
        req.flash('error', 'Password harus diisi');
        return res.redirect('/admin/settings');
      }

      const schoolName =
        req.body.school_name && req.body.school_name.trim() !== ''
          ? req.body.school_name.trim()
          : 'SMAN 1 CONTOH';

      const updateData = {
        router_ip,
        router_port: parseInt(router_port),
        router_user,
        router_password_encrypted: routerPasswordEncrypted,
        hotspot_dns_name: req.body.hotspot_dns_name || '',
        telegram_bot_token: req.body.telegram_bot_token || '',
        telegram_chat_id: req.body.telegram_chat_id || '',
        school_name: schoolName
      };

      Settings.update(updateData);
      console.log('[Settings] Router and notification settings updated');

      logActivity(req, 'UPDATE_SETTINGS', 'Router settings updated');

      req.flash('success', 'Settings berhasil diperbarui');
      return res.redirect('/admin/settings');
    } catch (error) {
      console.error('Update settings error:', error);
      req.flash('error', 'Gagal memperbarui settings: ' + error.message);
      return res.redirect('/admin/settings');
    }
  }

  /**
   * User Management Page
   */
  static async usersPage(req, res) {
    try {
      // Fetch only non-admin users (Guru/Normal users)
      const allUsers = User.findAll();
      const users = (allUsers || []).filter(user => user.role !== 'admin');
      res.render('admin/users', {
        title: 'Manajemen Akun Guru & Hotspot',
        users: users || [],
        session: req.session || {},
        error: req.query.error || null,
        success: req.query.success || null
      });
    } catch (error) {
      console.error('Users page error:', error);
      res.render('admin/users', {
        title: 'Manajemen Akun Guru & Hotspot',
        users: [],
        session: req.session || {},
        error: 'Gagal memuat data user',
        success: null
      });
    }
  }

  /**
   * Admin Management Page (Only Admin Users)
   */
  static async manageAdminsPage(req, res) {
    try {
      // Fetch only admin users
      const allUsers = User.findAll();
      const users = (allUsers || []).filter(user => user.role === 'admin');
      res.render('admin/manage_admins', {
        title: 'Manajemen Akun Admin',
        users: users || [],
        session: req.session || {},
        error: req.query.error || null,
        success: req.query.success || null
      });
    } catch (error) {
      console.error('Manage admins page error:', error);
      res.render('admin/manage_admins', {
        title: 'Manajemen Akun Admin',
        users: [],
        session: req.session || {},
        error: 'Gagal memuat data admin',
        success: null
      });
    }
  }

  /**
   * Get hotspot profiles from Mikrotik
   */
  static async getProfiles(req, res) {
    try {
      const profiles = await MikrotikService.getHotspotProfiles();
      return res.json({
        success: true,
        profiles: profiles.map((p) => ({
          name: p.name || p
        }))
      });
    } catch (error) {
      console.error('Get profiles error:', error);
      return res.json({
        success: false,
        message: error.message,
        profiles: []
      });
    }
  }

  /**
   * Verify Comment ID exists in Mikrotik
   */
  static async verifyCommentId(req, res) {
    try {
      const { comment_id, user_type } = req.body;

      if (!comment_id) {
        return res.json({
          success: false,
          exists: false,
          message: 'Comment ID tidak boleh kosong'
        });
      }

      const verification = await MikrotikService.verifyCommentId(comment_id);

      // Dynamic logic based on user_type
      if (user_type === 'existing') {
        // For existing users: expect to find the comment ID
        if (verification.exists) {
          return res.json({
            success: true,
            exists: true,
            username: verification.user?.name || 'N/A',
            message: 'Comment ID ditemukan di Mikrotik'
          });
        } else {
          return res.json({
            success: false,
            exists: false,
            message: 'Comment ID tidak ditemukan di Mikrotik.'
          });
        }
      } else if (user_type === 'new') {
        // For new users: expect NOT to find the comment ID
        if (verification.exists) {
          return res.json({
            success: false,
            exists: true,
            message: 'Comment ID sudah digunakan. Harap ganti ID.'
          });
        } else {
          return res.json({
            success: true,
            exists: false,
            message: 'Comment ID tersedia (tidak digunakan)'
          });
        }
      } else {
        // Fallback: no user_type specified, use old behavior
        if (verification.exists) {
          return res.json({
            success: true,
            exists: true,
            username: verification.user?.name || 'N/A',
            message: 'Comment ID ditemukan di Mikrotik'
          });
        } else {
          return res.json({
            success: true,
            exists: false,
            message: verification.error || 'Comment ID tidak ditemukan di Mikrotik'
          });
        }
      }
    } catch (error) {
      console.error('Verify comment error:', error);
      return res.json({
        success: false,
        exists: false,
        message: 'Gagal verifikasi: ' + error.message
      });
    }
  }

  /**
   * Create Admin User (Admin Management)
   */
  static async createAdminUser(req, res) {
    if (res.headersSent) {
      return;
    }

    try {
      // **ENFORCE SMART FALLBACK - MUST RUN BEFORE VALIDATION**
      if (!req.body.password || req.body.password.trim() === '') {
        req.body.password = req.body.username || '';
      }

      const { username, password } = req.body;

      if (!username || username.trim() === '') {
        req.flash('error', 'Username wajib diisi');
        return res.redirect('/admin/admins');
      }

      if (res.headersSent) {
        return;
      }

      const existingUser = User.findByUsername(username.trim());
      if (existingUser) {
        req.flash('error', 'Username sudah digunakan');
        return res.redirect('/admin/admins');
      }

      if (res.headersSent) {
        return;
      }

      const finalPassword = (password && password.trim() !== '') ? password.trim() : username.trim();
      const passwordHash = await bcrypt.hash(finalPassword, 10);
      const passwordEncrypted = cryptoHelper.encrypt(finalPassword);

      try {
        User.create({
          username: username.trim(),
          password_hash: passwordHash,
          password_plain: finalPassword,
          password_encrypted_viewable: passwordEncrypted,
          role: 'admin',
          mikrotik_comment_id: username.trim(),
          mikrotik_comment: username.trim(),
          must_change_password: 1
        });
      } catch (dbError) {
        if (res.headersSent) return;
        console.error('Database error creating admin:', dbError);
        let errorMessage = 'Gagal menyimpan admin ke database';
        if (dbError.message && dbError.message.includes('UNIQUE')) {
          if (dbError.message.includes('username')) {
            errorMessage = 'Username sudah digunakan';
          }
        } else {
          errorMessage = 'Gagal menyimpan admin ke database: ' + (dbError.message || 'Unknown error');
        }
        req.flash('error', errorMessage);
        return res.redirect('/admin/admins');
      }

      if (res.headersSent) {
        return;
      }

      try {
        logActivity(req, 'CREATE_USER', `Admin User: ${username.trim()}`);
      } catch (logError) {
        console.error('Failed to log activity:', logError);
      }

      req.flash('success', 'Akun Admin berhasil ditambahkan');
      return res.redirect('/admin/admins');
    } catch (error) {
      if (res.headersSent) {
        console.error('Create admin error (response already sent):', error);
        return;
      }
      console.error('Create admin error:', error);
      req.flash('error', 'Gagal menambahkan admin: ' + error.message);
      return res.redirect('/admin/admins');
    }
  }

  /**
   * Update Admin User
   */
  static async updateAdminUser(req, res) {
    if (res.headersSent) {
      return;
    }

    try {
      const userId = req.params.id;
      const { username, password } = req.body;

      if (!username || username.trim() === '') {
        req.flash('error', 'Username wajib diisi');
        return res.redirect('/admin/admins');
      }

      if (res.headersSent) {
        return;
      }

      const user = User.findById(userId);
      if (!user) {
        req.flash('error', 'Admin tidak ditemukan');
        return res.redirect('/admin/admins');
      }

      if (user.role !== 'admin') {
        req.flash('error', 'User ini bukan admin');
        return res.redirect('/admin/admins');
      }

      const updateData = {
        username: username.trim()
      };

      if (password && password.trim() !== '') {
        updateData.password_hash = await bcrypt.hash(password.trim(), 10);
        updateData.password_plain = password.trim();
        updateData.password_encrypted_viewable = cryptoHelper.encrypt(password.trim());
      } else {
        if (user.password_encrypted_viewable) {
          updateData.password_encrypted_viewable = user.password_encrypted_viewable;
        }
        if (user.password_plain) {
          updateData.password_plain = user.password_plain;
        }
      }

      const existingUser = User.findByUsername(username.trim());
      if (existingUser && existingUser.id !== parseInt(userId)) {
        req.flash('error', 'Username sudah digunakan');
        return res.redirect('/admin/admins');
      }

      if (res.headersSent) {
        return;
      }

      try {
        User.update(userId, updateData);
      } catch (dbError) {
        if (res.headersSent) return;
        console.error('Database error updating admin:', dbError);
        let errorMsg = 'Gagal memperbarui admin';
        if (dbError.message && dbError.message.includes('UNIQUE')) {
          if (dbError.message.includes('username')) {
            errorMsg = 'Username sudah digunakan';
          }
        } else {
          errorMsg = 'Gagal memperbarui admin: ' + (dbError.message || 'Unknown error');
        }
        req.flash('error', errorMsg);
        return res.redirect('/admin/admins');
      }

      if (res.headersSent) {
        return;
      }

      try {
        logActivity(req, 'UPDATE_USER', `Admin ID: ${userId}, Username: ${username.trim()}`);
      } catch (logError) {
        console.error('Failed to log activity:', logError);
      }

      req.flash('success', 'Admin berhasil diperbarui');
      return res.redirect('/admin/admins');
    } catch (error) {
      if (res.headersSent) {
        console.error('Update admin error (response already sent):', error);
        return;
      }
      console.error('Update admin error:', error);
      req.flash('error', 'Gagal memperbarui admin: ' + error.message);
      return res.redirect('/admin/admins');
    }
  }

  /**
   * Delete Admin User
   */
  static async deleteAdminUser(req, res) {
    if (res.headersSent) {
      return;
    }

    try {
      const userId = req.params.id;

      if (parseInt(userId) === req.session.userId) {
        req.flash('error', 'Tidak dapat menghapus akun sendiri');
        return res.redirect('/admin/admins');
      }

      const user = User.findById(userId);
      if (!user) {
        req.flash('error', 'Admin tidak ditemukan');
        return res.redirect('/admin/admins');
      }

      if (user.role !== 'admin') {
        req.flash('error', 'User ini bukan admin');
        return res.redirect('/admin/admins');
      }

      const deletedUsername = user.username;

      const deleteTransaction = dashboardDb.transaction(() => {
        dashboardDb.prepare('DELETE FROM login_attempts WHERE user_id = ?').run(userId);
        dashboardDb.prepare('DELETE FROM audit_logs WHERE user_id = ?').run(userId);
        dashboardDb.prepare('DELETE FROM users WHERE id = ?').run(userId);
      });

      deleteTransaction();

      if (res.headersSent) {
        return;
      }

      try {
        logActivity(req, 'DELETE_USER', `Admin ID: ${userId}, Username: ${deletedUsername}`);
      } catch (logError) {
        console.error('Failed to log activity:', logError);
      }

      req.flash('success', 'Admin berhasil dihapus');
      return res.redirect('/admin/admins');
    } catch (error) {
      if (res.headersSent) {
        console.error('Delete admin error (response already sent):', error);
        return;
      }
      console.error('Delete admin error:', error);
      req.flash('error', 'Gagal menghapus admin: ' + error.message);
      return res.redirect('/admin/admins');
    }
  }

  /**
   * Create User (Guru/Normal Users Only)
   */
  static async createUser(req, res) {
    // Check if response was already sent (guard against double responses)
    if (res.headersSent) {
      return;
    }

    try {
      // **ENFORCE SMART FALLBACK - MUST RUN BEFORE VALIDATION**
      // If password is not provided (empty string), use the username as the default password.
      // This ensures validation always sees a populated field.
      if (!req.body.password || req.body.password.trim() === '') {
        req.body.password = req.body.username || '';
      }

      // If hotspot_password is not provided and user_type is 'new', it will fallback later
      // to the finalized password (which may be username if password was empty)

      const validationResponse = respondValidationErrors(req, res, '/admin/users');
      if (validationResponse) {
        return validationResponse;
      }

      // Double-check after validation (in case validation sent response)
      if (res.headersSent) {
        return;
      }

      let {
        username,
        password,
        mikrotik_comment_id,
        user_type,
        hotspot_username,
        hotspot_password,
        hotspot_profile
      } = req.body;

      // Stage 1: Final Web Password
      // Password is now guaranteed to have a value (either from user input or fallback to username)
      const finalWebPassword = (password && password.trim() !== '') ? password.trim() : username;

      // If mikrotik_comment_id is empty (though it's required in form), use username
      if (!mikrotik_comment_id || mikrotik_comment_id.trim() === '') {
        mikrotik_comment_id = username;
      }

      // Use mikrotik_comment_id directly as the Mikrotik comment
      // This is the single source of truth for the unique identifier
      const mikrotikComment = mikrotik_comment_id.trim();

      // Guard check before each response
      if (res.headersSent) {
        return;
      }

      const existingUser = User.findByUsername(username);
      if (existingUser) {
        req.flash('error', 'Username sudah digunakan');
        return res.redirect('/admin/users');
      }

      // Guard check before each response
      if (res.headersSent) {
        return;
      }

      const existingComment = User.findByComment(mikrotik_comment_id);
      if (existingComment) {
        req.flash('error', 'Mikrotik Comment ID sudah digunakan');
        return res.redirect('/admin/users');
      }

      if (user_type === 'new') {
        // Stage 2: Determine Hotspot Credentials
        // Hotspot Username falls back to Web Username
        const finalHotspotUsername = (hotspot_username && hotspot_username.trim() !== '') 
          ? hotspot_username.trim() 
          : username;
        
        // Hotspot Password falls back to finalWebPassword (from Stage 1)
        const finalHotspotPassword = (hotspot_password && hotspot_password.trim() !== '') 
          ? hotspot_password.trim() 
          : finalWebPassword;

        // Profile is required
        if (!hotspot_profile || hotspot_profile.trim() === '') {
          if (res.headersSent) return;
          req.flash('error', 'Profile Hotspot harus dipilih untuk user baru');
          return res.redirect('/admin/users');
        }

        // Guard check before async operation
        if (res.headersSent) {
          return;
        }

        const verification = await MikrotikService.verifyCommentId(mikrotik_comment_id);
        if (verification.exists) {
          if (res.headersSent) return;
          req.flash('error', 'Comment ID sudah ada di Mikrotik. Pilih opsi "User Sudah Ada di Mikrotik"');
          return res.redirect('/admin/users');
        }

        try {
          // Stage 3: Create Hotspot User with final credentials
          await MikrotikService.createHotspotUser(
            finalHotspotUsername,
            finalHotspotPassword,
            mikrotikComment, // Use mikrotik_comment_id directly as Mikrotik comment
            hotspot_profile.trim()
          );
        } catch (error) {
          if (res.headersSent) return;
          req.flash('error', 'Gagal membuat user di Mikrotik: ' + error.message);
          return res.redirect('/admin/users');
        }
      } else {
        // Guard check before async operation
        if (res.headersSent) {
          return;
        }

        const verification = await MikrotikService.verifyCommentId(mikrotik_comment_id);
        if (!verification.exists) {
          if (res.headersSent) return;
          req.flash('error', 'Comment ID tidak ditemukan di Mikrotik. Pastikan user sudah ada atau pilih opsi "User Baru + Buat di Mikrotik"');
          return res.redirect('/admin/users');
        }
      }

      // Guard check before async operations
      if (res.headersSent) {
        return;
      }

      // Use finalWebPassword for database storage
      const passwordHash = await bcrypt.hash(finalWebPassword, 10);
      const passwordEncrypted = cryptoHelper.encrypt(finalWebPassword);

      // Guard check after async operations
      if (res.headersSent) {
        return;
      }

      try {
      User.create({
        username,
        password_hash: passwordHash,
        password_plain: finalWebPassword,
        password_encrypted_viewable: passwordEncrypted,
        role: 'guru', // Force role to 'guru' for regular user management
        mikrotik_comment_id,
        mikrotik_comment: mikrotikComment, // Save mikrotik_comment_id as comment to DB
        must_change_password: 1 // CRITICAL: Force password change
      });
      } catch (dbError) {
        // Handle database errors (e.g., UNIQUE constraint violations)
        if (res.headersSent) return;
        console.error('Database error creating user:', dbError);
        let errorMessage = 'Gagal menyimpan user ke database';
        if (dbError.message && dbError.message.includes('UNIQUE')) {
          if (dbError.message.includes('username')) {
            errorMessage = 'Username sudah digunakan';
          } else if (dbError.message.includes('mikrotik_comment')) {
            errorMessage = 'Mikrotik Comment ID sudah digunakan';
          }
        } else {
          errorMessage = 'Gagal menyimpan user ke database: ' + (dbError.message || 'Unknown error');
        }
        req.flash('error', errorMessage);
        return res.redirect('/admin/users');
      }

      // Guard check before final response
      if (res.headersSent) {
        return;
      }

      // Log activity (wrapped in try-catch to prevent errors from breaking the flow)
      try {
        logActivity(req, 'CREATE_USER', `Username: ${username}, Comment ID: ${mikrotik_comment_id}`);
      } catch (logError) {
        // Log error but don't fail the request
        console.error('Failed to log activity:', logError);
      }

      const message =
        user_type === 'new'
          ? 'User berhasil ditambahkan dan user hotspot berhasil dibuat di Mikrotik'
          : 'User berhasil ditambahkan';

      req.flash('success', message);
      return res.redirect('/admin/users');
    } catch (error) {
      // Guard check in catch block
      if (res.headersSent) {
        console.error('Create user error (response already sent):', error);
        return;
      }
      console.error('Create user error:', error);
      req.flash('error', 'Gagal menambahkan user: ' + error.message);
      return res.redirect('/admin/users');
    }
  }

  /**
   * Update User
   */
  static async updateUser(req, res) {
    try {
      const userId = req.params.id;
      const { username, password, mikrotik_comment_id } = req.body;

      const validationResponse = respondValidationErrors(req, res, '/admin/users');
      if (validationResponse) {
        return validationResponse;
      }

      // Check if this is an API request (fetch) or form submission
      const isApiRequest = req.headers.accept && req.headers.accept.includes('application/json');

      const user = User.findById(userId);
      if (!user) {
        const errorMsg = 'User tidak ditemukan';
        if (isApiRequest) {
          return res.status(404).json({ success: false, message: errorMsg });
        }
        req.flash('error', errorMsg);
        return res.redirect('/admin/users');
      }

      const updateData = {
        username,
        mikrotik_comment_id
      };

      if (password && password.trim() !== '') {
        updateData.password_hash = await bcrypt.hash(password, 10);
        updateData.password_plain = password;
        updateData.password_encrypted_viewable = cryptoHelper.encrypt(password);
      } else {
        if (user.password_encrypted_viewable) {
          updateData.password_encrypted_viewable = user.password_encrypted_viewable;
        }
        if (user.password_plain) {
          updateData.password_plain = user.password_plain;
        }
      }

      const existingUser = User.findByUsername(username);
      if (existingUser && existingUser.id !== parseInt(userId)) {
        const errorMsg = 'Username sudah digunakan';
        if (isApiRequest) {
          return res.status(409).json({ success: false, message: errorMsg });
        }
        req.flash('error', errorMsg);
        return res.redirect('/admin/users');
      }

      const existingComment = User.findByComment(mikrotik_comment_id);
      if (existingComment && existingComment.id !== parseInt(userId)) {
        const errorMsg = 'Mikrotik Comment ID sudah digunakan';
        if (isApiRequest) {
          return res.status(409).json({ success: false, message: errorMsg });
        }
        req.flash('error', errorMsg);
        return res.redirect('/admin/users');
      }

      try {
        User.update(userId, updateData);
      } catch (dbError) {
        let errorMsg = 'Gagal memperbarui user';
        if (dbError.message && dbError.message.includes('UNIQUE')) {
          if (dbError.message.includes('username')) {
            errorMsg = 'Username sudah digunakan';
          } else if (dbError.message.includes('mikrotik_comment')) {
            errorMsg = 'Mikrotik Comment ID sudah digunakan';
          }
        } else {
          errorMsg = dbError.message || errorMsg;
        }

        if (isApiRequest) {
          return res.status(500).json({ success: false, message: errorMsg });
        }
        req.flash('error', errorMsg);
        return res.redirect('/admin/users');
      }

      logActivity(req, 'UPDATE_USER', `User ID: ${userId}, Username: ${username}, Comment ID: ${mikrotik_comment_id}`);

      const successMsg = 'User berhasil diperbarui';
      if (isApiRequest) {
        return res.status(200).json({ success: true, message: successMsg });
      }
      req.flash('success', successMsg);
      return res.redirect('/admin/users');
    } catch (error) {
      console.error('Update user error:', error);
      const errorMsg = 'Gagal memperbarui user: ' + (error.message || 'Unknown error');

      const isApiRequest = req.headers.accept && req.headers.accept.includes('application/json');
      if (isApiRequest) {
        return res.status(500).json({ success: false, message: errorMsg });
      }
      req.flash('error', errorMsg);
      return res.redirect('/admin/users');
    }
  }

  /**
   * Reveal Password (Decrypt for Admin View)
   */
  static async revealPassword(req, res) {
    try {
      if (req.session.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized: Admin access required'
        });
      }

      const userId = req.body.user_id || req.params.id;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'User ID is required'
        });
      }

      const user = User.findById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Security: Prevent viewing passwords of ALL admin accounts
      // This applies to the admin management page where all users are admins
      if (user && user.role === 'admin') {
        return res.json({
          success: false,
          message: 'Aksi ditolak: Tidak diizinkan melihat sandi akun Admin.'
        });
      }

      let plainPassword = null;
      if (user.password_encrypted_viewable) {
        try {
          plainPassword = cryptoHelper.decrypt(user.password_encrypted_viewable);
        } catch (error) {
          console.error('Decryption error:', error);
          plainPassword = user.password_plain || null;
        }
      } else if (user.password_plain) {
        plainPassword = user.password_plain;
      }

      if (!plainPassword) {
        return res.json({
          success: false,
          message: 'Password tidak tersedia untuk user ini'
        });
      }

      return res.json({
        success: true,
        plain_password: plainPassword
      });
    } catch (error) {
      console.error('Reveal password error:', error);
      return res.status(500).json({
        success: false,
        message: 'Gagal mengambil password: ' + error.message
      });
    }
  }

  /**
   * Delete User
   */
  static async deleteUser(req, res) {
    try {
      const userId = req.params.id;

      // Prevent self-deletion
      if (parseInt(userId) === req.session.userId) {
        req.flash('error', 'Tidak dapat menghapus akun sendiri');
        return res.redirect('/admin/users');
      }

      const user = User.findById(userId);
      if (!user) {
        req.flash('error', 'User tidak ditemukan');
        return res.redirect('/admin/users');
      }

      const deletedUsername = user.username;
      const commentId = user.mikrotik_comment_id;

      // 1. Try to delete from Mikrotik first (Async operation outside DB transaction)
      if (commentId) {
        try {
          const verification = await MikrotikService.verifyCommentId(commentId);
          if (verification.exists && verification.user && verification.user['.id']) {
            // Use the newly added deleteHotspotUser method
            await MikrotikService.deleteHotspotUser(verification.user['.id']);
          }
        } catch (mikrotikError) {
          console.error('Failed to delete Mikrotik user:', mikrotikError);
          // Continue to delete local user even if Mikrotik fails, but log it.
        }
      }

      // 2. Transactional Delete from Local DB
      // We use dashboardDb.transaction to ensure atomicity and handle FK constraints manually if needed
      const deleteTransaction = dashboardDb.transaction(() => {
        // Delete dependent records first (Manual Cascade)
        dashboardDb.prepare('DELETE FROM login_attempts WHERE user_id = ?').run(userId);
        dashboardDb.prepare('DELETE FROM audit_logs WHERE user_id = ?').run(userId);

        // Delete the user
        dashboardDb.prepare('DELETE FROM users WHERE id = ?').run(userId);
      });

      deleteTransaction();

      logActivity(req, 'DELETE_USER', `User ID: ${userId}, Username: ${deletedUsername}`);

      req.flash('success', 'User berhasil dihapus');
      return res.redirect('/admin/users');
    } catch (error) {
      console.error('Delete user error:', error);
      req.flash('error', 'Gagal menghapus user: ' + error.message);
      return res.redirect('/admin/users');
    }
  }

  /**
   * Get Top 5 Users by Bandwidth Usage
   */
  static async getTopUsers(req, res) {
    try {
      const allUsers = await MikrotikService.getAllHotspotUsers();
      if (!allUsers || allUsers.length === 0) {
        return res.json({ success: true, data: [] });
      }

      const usersWithBytes = allUsers
        .map((user) => {
          try {
            const bytesOut = parseInt(user['bytes-out'] || '0', 10);
            const bytesIn = parseInt(user['bytes-in'] || '0', 10);
            return {
              username: user.name || 'N/A',
              comment: user.comment || '-',
              'bytes-out': bytesOut,
              'bytes-in': bytesIn,
              download_formatted: formatter.formatBytes(bytesOut),
              upload_formatted: formatter.formatBytes(bytesIn)
            };
          } catch (error) {
            console.error('Error processing user:', error);
            return null;
          }
        })
        .filter((u) => u !== null)
        .sort((a, b) => b['bytes-out'] - a['bytes-out'])
        .slice(0, 5)
        .map((user, index) => ({
          rank: index + 1,
          username: user.username,
          comment: user.comment,
          download_formatted: user.download_formatted,
          upload_formatted: user.upload_formatted
        }));

      return res.json({ success: true, data: usersWithBytes });
    } catch (error) {
      console.error('Get top users error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch top users'
      });
    }
  }

  /**
   * Import Users from CSV/Excel
   */
  static async importUsers(req, res) {
    if (!req.file) {
      req.flash('error', 'File tidak ditemukan');
      return res.redirect('/admin/users');
    }

    const results = [];
    const errors = [];
    const successUsers = [];
    let processedCount = 0;

    try {
      // Parse CSV
      await new Promise((resolve, reject) => {
        fs.createReadStream(req.file.path)
          .pipe(csv())
          .on('data', (data) => results.push(data))
          .on('end', resolve)
          .on('error', reject);
      });

      // Process each row
      for (const row of results) {
        processedCount++;
        // Expecting 'nip' and 'nama_guru'
        const { nip, nama_guru } = row;

        // Basic Validation
        if (!nip || !nama_guru) {
          errors.push(`Row ${processedCount}: Missing required fields (nip, nama_guru)`);
          continue;
        }

        const username = nip.trim();
        const password = nip.trim(); // Default password is NIP
        const mikrotik_comment_id = nip.trim(); // Store NIP as ID
        const mikrotik_comment_name = nama_guru.trim(); // Use Name for Mikrotik Comment

        // Check duplicates in DB
        const existingUser = User.findByUsername(username);
        if (existingUser) {
          errors.push(`Row ${processedCount}: NIP '${username}' already exists`);
          continue;
        }

        const existingComment = User.findByComment(mikrotik_comment_id);
        if (existingComment) {
          errors.push(`Row ${processedCount}: NIP '${mikrotik_comment_id}' already exists as Comment ID`);
          continue;
        }

        // Prepare User Data
        const passwordHash = await bcrypt.hash(password, 10);
        const passwordEncrypted = cryptoHelper.encrypt(password);

        successUsers.push({
          username,
          password_hash: passwordHash,
          password_plain: password,
          password_encrypted_viewable: passwordEncrypted,
          role: 'guru',
          mikrotik_comment_id,
          must_change_password: 1, // Force password change
          mikrotik_comment_name // Pass this for Mikrotik creation
        });
      }

      if (successUsers.length > 0) {
        // DB Transaction
        try {
          // Note: bulkCreate in User model needs to handle 'must_change_password' if we added it to the query?
          // Wait, I need to update User.bulkCreate to include 'must_change_password'.
          // Or I can update User.bulkCreate now.
          // Let's check User.js content again.
          // I will update User.bulkCreate in the next step or assume I need to do it.
          // I'll update User.bulkCreate first or concurrently.
          // For now, let's assume User.bulkCreate will be updated.

          // Actually, I should update User.js first or use a loop here if I can't update it easily.
          // But I can update it.
          // I will update User.js in a separate tool call.

          User.bulkCreate(successUsers);
        } catch (dbError) {
          console.error('Bulk create error:', dbError);
          fs.unlinkSync(req.file.path);
          req.flash('error', 'Gagal menyimpan ke database: ' + dbError.message);
          return res.redirect('/admin/users');
        }

        // Mikrotik Creation (Best Effort)
        const mikrotikErrors = [];
        for (const user of successUsers) {
          try {
            // Create in Mikrotik: Name=NIP, Password=NIP, Comment=Nama Guru
            // We need to check if user exists first?
            // mikrotikService.createHotspotUser(username, password, comment, profile)
            // Wait, createHotspotUser takes (username, password, commentId, profile).
            // And it sets comment=commentId.
            // Requirement: "The Teacher's Name (nama_guru) will be used as the Mikrotik user's comment".
            // So I should pass `nama_guru` as the 3rd argument.
            // BUT, `createHotspotUser` also checks if comment exists.
            // If I pass Name as comment, it checks if Name exists as comment.
            // This is fine, assuming names are unique enough or we don't care about name collision as much as ID collision.
            // But if 2 teachers have same name, 2nd one fails.
            // Maybe I should append NIP? "Nama Guru (NIP)".
            // User said: "The Teacher's Name (nama_guru) will be used as the Mikrotik user's comment for easy identification."
            // I'll stick to `nama_guru`.

            // Also, `createHotspotUser` needs a profile.
            // I'll use 'default' or fetch one.
            // I'll try to use 'default' if not specified.

            await MikrotikService.createHotspotUser(
              user.username, // NIP
              user.password_plain, // NIP
              user.mikrotik_comment_name, // Nama Guru
              'default' // Default profile
            );

          } catch (mtError) {
            mikrotikErrors.push(`User ${user.username}: Mikrotik error - ${mtError.message}`);
          }
        }

        fs.unlinkSync(req.file.path);

        const summary = `Import Selesai. Total: ${processedCount}, Sukses: ${successUsers.length}, Gagal: ${errors.length}. ${mikrotikErrors.length > 0 ? 'Mikrotik Issues: ' + mikrotikErrors.length : ''}`;
        req.flash('success', summary);
        return res.redirect('/admin/users');
      } else {
        fs.unlinkSync(req.file.path);
        req.flash('error', 'Tidak ada user yang valid untuk diimport. Errors: ' + errors.join(', '));
        return res.redirect('/admin/users');
      }

    } catch (error) {
      if (req.file) fs.unlinkSync(req.file.path);
      console.error('Import error:', error);
      req.flash('error', 'Terjadi kesalahan saat import: ' + error.message);
      return res.redirect('/admin/users');
    }
  }

  /**
   * Test Telegram Notification
   */
  static async testTelegram(req, res) {
    try {
      const { sendTelegramMessage, escapeHtml } = require('../services/notificationService');
      let { telegram_bot_token, telegram_chat_id } = req.body;

      if (!telegram_bot_token || !telegram_chat_id || telegram_bot_token.trim() === '' || telegram_chat_id.trim() === '') {
        const settings = Settings.get();
        if (settings.telegram_bot_token && settings.telegram_chat_id &&
          settings.telegram_bot_token.trim() !== '' && settings.telegram_chat_id.trim() !== '') {
          telegram_bot_token = settings.telegram_bot_token;
          telegram_chat_id = settings.telegram_chat_id;
        } else {
          return res.status(400).json({
            success: false,
            message: 'Bot Token and Chat ID are required. Please enter them in the form or save them first.'
          });
        }
      }

      const currentTime = new Date().toLocaleString('id-ID', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      const testMessage = `✅ <b>System Connectivity Test</b>

<b>Status:</b> 🟢 Online
<b>Server Time:</b> <code>${escapeHtml(currentTime)}</code>
<b>Message:</b> Integration is working perfectly!

<i>Mikrotik Hotspot Manager</i>`;

      const result = await sendTelegramMessage(
        testMessage,
        telegram_bot_token.trim(),
        telegram_chat_id.trim()
      );

      if (result.success) {
        return res.json({ success: true, message: 'Test message sent successfully' });
      } else {
        return res.status(400).json({ success: false, message: result.message });
      }
    } catch (error) {
      console.error('Test telegram error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to send test message'
      });
    }
  }

  /**
   * Get active devices API endpoint for Live Monitoring Modal
   * Returns detailed session data filtered for Teachers/Gurus only
   */
  static async getActiveDevicesApi(req, res) {
    try {
      // Fetch all detailed active sessions from Mikrotik
      const allSessions = await MikrotikService.getDetailedActiveSessions();

      // Get all guru users to filter sessions
      const allUsers = User.findAll().filter((u) => u.role === 'guru');
      const commentIdSet = new Set(allUsers.map((u) => u.mikrotik_comment_id).filter(Boolean));

      // Map username to comment ID for filtering
      const usernameToCommentMap = new Map();
      const uniqueUsernames = [
        ...new Set(allSessions.map((s) => s.user).filter(Boolean))
      ];

      for (const username of uniqueUsernames) {
        try {
          const hotspotUser = await MikrotikService.getHotspotUserByUsername(username);
          if (hotspotUser && hotspotUser.comment) {
            usernameToCommentMap.set(username, hotspotUser.comment);
          }
        } catch (error) {
          console.error(`Error fetching user ${username}:`, error);
        }
      }

      // Filter sessions to only include Teachers/Gurus
      const filteredSessions = allSessions
        .filter((session) => {
          const commentId = usernameToCommentMap.get(session.user);
          return commentId && commentIdSet.has(commentId);
        })
        .map((session) => {
          const commentId = usernameToCommentMap.get(session.user) || null;
          const uptimeSeconds = formatter.parseUptimeToSeconds(session.uptime);
          const formattedUptime = formatter.formatUptime(uptimeSeconds);

          return {
            user: session.user,
            ip: session.ip,
            hostname: session.hostname,
            mac: session.mac,
            uptime: session.uptime,
            formattedUptime,
            commentId,
            sessionId: session.sessionId
          };
        });

      return res.json({
        success: true,
        sessions: filteredSessions,
        total: filteredSessions.length
      });
    } catch (error) {
      console.error('Error getting active devices:', error);
      return res.status(500).json({
        success: false,
        message: 'Gagal memuat data perangkat aktif: ' + error.message,
        sessions: [],
        total: 0
      });
    }
  }

  static async getLogsApi(req, res) {
    try {
      const searchQuery = req.query.search ? req.query.search.trim() : '';
      let actionFilter = req.query.action_type ? req.query.action_type.trim().toUpperCase() : '';
      if (actionFilter && !ACTION_OPTIONS.includes(actionFilter)) {
        actionFilter = '';
      }

      const limitParam = parseInt(req.query.limit, 10);
      const limit = Number.isNaN(limitParam) ? 20 : Math.min(Math.max(limitParam, 5), 100);
      const pageParam = parseInt(req.query.page, 10);
      let currentPage = Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
      const offset = (currentPage - 1) * limit;

      const filters = [];
      const params = [];

      if (searchQuery) {
        filters.push(
          `(COALESCE(al.username, u.username) LIKE ? OR al.details LIKE ? OR al.ip_address LIKE ?)`
        );
        const like = `%${searchQuery}%`;
        params.push(like, like, like);
      }

      if (actionFilter) {
        filters.push('al.action = ?');
        params.push(actionFilter);
      }

      const baseQuery = `
        FROM audit_logs al
        LEFT JOIN users u ON al.user_id = u.id
      `;
      const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

      const countStmt = dashboardDb.prepare(`SELECT COUNT(*) as total ${baseQuery} ${whereClause}`);
      const totalResult = countStmt.get(...params);
      const totalRecords = totalResult ? totalResult.total : 0;
      const totalPages = totalRecords > 0 ? Math.ceil(totalRecords / limit) : 1;

      if (currentPage > totalPages) {
        currentPage = totalPages;
      }
      const adjustedOffset = (currentPage - 1) * limit;

      const dataStmt = dashboardDb.prepare(
        `SELECT 
          al.*,
          COALESCE(al.username, u.username) AS username
        ${baseQuery}
        ${whereClause}
        ORDER BY al.created_at DESC
        LIMIT ? OFFSET ?`
      );

      const dataParams = [...params, limit, adjustedOffset];
      const logs = dataStmt.all(...dataParams).map((log) => ({
        ...log,
        created_at_formatted: formatter.formatDateID(log.created_at)
      }));

      return res.json({
        success: true,
        logs,
        totalPages,
        currentPage,
        totalRecords
      });
    } catch (error) {
      console.error('Logs API error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Gagal memuat log aktifitas'
      });
    }
  }

  static async runDiagnostics(req, res) {
    try {
      const validationResponse = respondValidationErrors(req, res);
      if (validationResponse) {
        return validationResponse;
      }

      const settings = Settings.get();
      let routerPassword = req.body.router_password ? req.body.router_password.trim() : '';
      if (!routerPassword) {
        if (settings.router_password_encrypted && settings.router_password_encrypted.trim() !== '') {
          const decrypted = cryptoHelper.decrypt(settings.router_password_encrypted);
          routerPassword = decrypted || '';
        } else if (settings.router_password) {
          routerPassword = settings.router_password;
        }
      }

      const config = {
        host: req.body.router_ip || settings.router_ip,
        port: parseInt(req.body.router_port, 10) || settings.router_port,
        user: req.body.router_user || settings.router_user,
        password: routerPassword
      };

      const diagnostics = await MikrotikService.runDiagnostics(config);
      return res.json({
        success: true,
        diagnostics
      });
    } catch (error) {
      console.error('Run diagnostics error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Gagal menjalankan diagnostics'
      });
    }
  }
}

module.exports = AdminController;

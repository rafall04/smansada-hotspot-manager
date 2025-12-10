const { RouterOSAPI } = require('node-routeros-v2');
const Settings = require('../models/Settings');
const cryptoHelper = require('../utils/cryptoHelper');
const { sendTelegramMessage, escapeHtml } = require('./notificationService');

/**
 * Helper function to detect and format CANTLOGIN errors
 * @param {Error} error - The error object from Mikrotik API
 * @returns {string|null} - User-friendly error message or null if not CANTLOGIN
 */
function formatMikrotikError(error) {
  if (error.errno === 'CANTLOGIN' ||
      (error.message && error.message.includes('CANTLOGIN')) ||
      (error.message && (error.message.toLowerCase().includes('cannot log') ||
                       error.message.toLowerCase().includes('invalid password') ||
                       error.message.toLowerCase().includes('wrong password')))) {
    return 'Gagal Login ke Mikrotik. Pastikan **Username dan Password Router API** yang tersimpan di halaman Settings sudah benar.';
  }
  return null;
}

class MikrotikService {
  static getRouterConfig() {
    const settings = Settings.get();

    if (!settings || Object.keys(settings).length === 0) {
      return {
        host: '192.168.88.1',
        port: 8728,
        user: 'admin',
        password: 'admin'
      };
    }

    let routerPassword = 'admin';
    if (settings.router_password_encrypted && settings.router_password_encrypted.trim() !== '') {
      const decrypted = cryptoHelper.decrypt(settings.router_password_encrypted);
      routerPassword = decrypted || 'admin';
    } else if (settings.router_password) {
      routerPassword = settings.router_password;
    }

    return {
      host: settings.router_ip || '192.168.88.1',
      port: settings.router_port || 8728,
      user: settings.router_user || 'admin',
      password: routerPassword
    };
  }

  static createConnection() {
    const config = this.getRouterConfig();
    return new RouterOSAPI({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password
    });
  }

  static async connectWithTimeout(conn) {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Koneksi ke Router Gagal. Cek Sandi/IP Router atau pastikan Router dapat dijangkau.'));
      }, 5000);
    });

    return Promise.race([
      conn.connect(),
      timeoutPromise
    ]);
  }

  static async testConnection() {
    try {
      const conn = this.createConnection();
      await this.connectWithTimeout(conn);
      conn.close();
      return { success: true, message: 'Koneksi berhasil' };
    } catch (error) {
      const cantLoginMessage = formatMikrotikError(error);
      if (cantLoginMessage) {
        return { success: false, message: cantLoginMessage };
      }

      let userFriendlyMessage = 'Koneksi ke Router Gagal. Cek Sandi/IP Router.';

      if (error.message && error.message.includes('Koneksi ke Router Gagal')) {
        userFriendlyMessage = error.message;
      } else if (error.message && error.message.includes('timeout')) {
        userFriendlyMessage = 'Koneksi ke Router Gagal. Router tidak merespons dalam 5 detik. Cek koneksi jaringan dan IP Router.';
      } else if (error.message && (error.message.includes('password') || error.message.includes('authentication'))) {
        userFriendlyMessage = 'Koneksi ke Router Gagal. Password atau username salah.';
      } else if (error.message && error.message.includes('ECONNREFUSED')) {
        userFriendlyMessage = 'Koneksi ke Router Gagal. Router tidak dapat dijangkau. Cek IP dan port Router.';
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

      const errorMessage = `⚠️ <b>Mikrotik Disconnected</b>

<b>Error:</b> <code>${escapeHtml(error.message)}</code>
<b>Time:</b> <code>${escapeHtml(currentTime)}</code>

<i>Please check router connection and settings.</i>`;

      sendTelegramMessage(errorMessage).catch(err => {
        console.error('[Telegram] Notification error:', err.message);
      });

      return {
        success: false,
        message: userFriendlyMessage
      };
    }
  }

  static async getHotspotUserByComment(commentId) {
    const conn = this.createConnection();
    try {
      await this.connectWithTimeout(conn);

      let users = await conn.write('/ip/hotspot/user/print', ['?comment=' + commentId]);

      if (!users || users.length === 0) {
        const allUsers = await conn.write('/ip/hotspot/user/print');
        if (allUsers && allUsers.length > 0) {
          users = allUsers.filter(user => {
            const comment = user.comment || '';
            return comment === commentId ||
                   comment.includes(`NIP:${commentId}`) ||
                   comment.endsWith(`- NIP:${commentId}`) ||
                   comment.includes(`- NIP:${commentId} -`);
          });
        }
      }

      if (!users || users.length === 0) {
        return null;
      }

      return users[0];
    } catch (error) {
      const cantLoginMessage = formatMikrotikError(error);
      if (cantLoginMessage) {
        throw new Error(cantLoginMessage);
      }
      throw new Error(`Gagal mengambil user hotspot: ${error.message}`);
    } finally {
      conn.close();
    }
  }

  static async updateHotspotUser(mikrotikId, username, password, commentId) {
    try {
      const conn = this.createConnection();
      await this.connectWithTimeout(conn);

      const existingUsers = await conn.write('/ip/hotspot/user/print', ['?name=' + username]);

      if (existingUsers && existingUsers.length > 0) {
        const existingUser = existingUsers[0];
        if (existingUser['.id'] !== mikrotikId) {
          conn.close();
          throw new Error('Username sudah digunakan oleh user lain');
        }
      }

      await conn.write('/ip/hotspot/user/set', [
        '=.id=' + mikrotikId,
        '=name=' + username,
        '=password=' + password,
        '=comment=' + commentId
      ]);

      conn.close();
      return { success: true, message: 'User hotspot berhasil diperbarui' };
    } catch (error) {
      const cantLoginMessage = formatMikrotikError(error);
      if (cantLoginMessage) {
        throw new Error(cantLoginMessage);
      }
      throw new Error(`Gagal memperbarui user hotspot: ${error.message}`);
    }
  }

  static async kickActiveUser(hotspotUsername) {
    try {
      const conn = this.createConnection();
      await this.connectWithTimeout(conn);

      const activeSessions = await conn.write('/ip/hotspot/active/print', [
        '?user=' + hotspotUsername
      ]);

      if (activeSessions && activeSessions.length > 0) {
        for (const session of activeSessions) {
          await conn.write('/ip/hotspot/active/remove', ['=.id=' + session['.id']]);
        }
      }

      conn.close();
      return {
        success: true,
        message: `Berhasil memutus ${activeSessions.length} sesi aktif`
      };
    } catch (error) {
      const cantLoginMessage = formatMikrotikError(error);
      if (cantLoginMessage) {
        throw new Error(cantLoginMessage);
      }
      throw new Error(`Gagal memutus koneksi: ${error.message}`);
    }
  }

  static async kickSessionById(sessionId, hotspotUsername) {
    try {
      const conn = this.createConnection();
      await this.connectWithTimeout(conn);

      const activeSessions = await conn.write('/ip/hotspot/active/print', [
        '?user=' + hotspotUsername
      ]);

      const session = activeSessions.find((s) => s['.id'] === sessionId);
      if (!session) {
        conn.close();
        throw new Error('Session tidak ditemukan atau tidak dimiliki oleh user ini');
      }

      await conn.write('/ip/hotspot/active/remove', ['=.id=' + sessionId]);

      conn.close();
      return {
        success: true,
        message: 'Session berhasil dihapus'
      };
    } catch (error) {
      const cantLoginMessage = formatMikrotikError(error);
      if (cantLoginMessage) {
        throw new Error(cantLoginMessage);
      }
      throw new Error(`Gagal memutus koneksi: ${error.message}`);
    }
  }

  static async getAllActiveSessions(hotspotUsername) {
    try {
      const conn = this.createConnection();
      await this.connectWithTimeout(conn);

      const activeSessions = await conn.write('/ip/hotspot/active/print', [
        '?user=' + hotspotUsername
      ]);

      conn.close();

      return activeSessions || [];
    } catch (error) {
      console.error('Error getting active sessions:', error);
      return [];
    }
  }

  static async getDeviceQuota(hotspotUsername) {
    try {
      const conn = this.createConnection();
      await this.connectWithTimeout(conn);

      const users = await conn.write('/ip/hotspot/user/print', ['?name=' + hotspotUsername]);

      if (!users || users.length === 0) {
        conn.close();
        return {
          profileName: null,
          maxDevices: null,
          currentDevices: 0,
          isFull: false
        };
      }

      const user = users[0];
      const profileName = user.profile || 'default';

      let maxDevices = null;
      if (profileName) {
        const profiles = await conn.write('/ip/hotspot/user/profile/print', ['?name=' + profileName]);

        if (profiles && profiles.length > 0) {
          const profile = profiles[0];
          const sharedUsers = profile['shared-users'];

          if (sharedUsers !== undefined && sharedUsers !== null && sharedUsers !== '') {
            const sharedUsersNum = parseInt(sharedUsers, 10);
            if (!isNaN(sharedUsersNum) && sharedUsersNum > 0) {
              maxDevices = sharedUsersNum;
            }
          }
        }
      }

      const activeSessions = await conn.write('/ip/hotspot/active/print', [
        '?user=' + hotspotUsername
      ]);

      conn.close();

      const currentDevices = activeSessions ? activeSessions.length : 0;
      const isFull = maxDevices !== null && currentDevices >= maxDevices;

      return {
        profileName,
        maxDevices,
        currentDevices,
        isFull
      };
    } catch (error) {
      console.error('Error getting device quota:', error);
      return {
        profileName: null,
        maxDevices: null,
        currentDevices: 0,
        isFull: false
      };
    }
  }

  static async getAllActiveHotspotSessions() {
    try {
      const conn = this.createConnection();
      await this.connectWithTimeout(conn);

      const activeSessions = await conn.write('/ip/hotspot/active/print');

      conn.close();

      return activeSessions || [];
    } catch (error) {
      console.error('Error getting all active sessions:', error);
      return [];
    }
  }

  static async getDetailedActiveSessions() {
    try {
      const conn = this.createConnection();
      await this.connectWithTimeout(conn);

      const activeSessions = await conn.write('/ip/hotspot/active/print');
      const dhcpLeases = await conn.write('/ip/dhcp-server/lease/print');

      conn.close();

      const ipToHostnameMap = new Map();
      if (dhcpLeases && Array.isArray(dhcpLeases)) {
        for (const lease of dhcpLeases) {
          const ip = lease.address;
          const hostname = lease['host-name'] || lease['hostname'] || null;
          if (ip && hostname) {
            ipToHostnameMap.set(ip, hostname);
          }
        }
      }

      const detailedSessions = [];
      if (activeSessions && Array.isArray(activeSessions)) {
        for (const session of activeSessions) {
          const ip = session.address || session['ip-address'] || null;
          const hostname = ip ? (ipToHostnameMap.get(ip) || null) : null;

          detailedSessions.push({
            user: session.user || 'N/A',
            ip: ip || 'N/A',
            hostname: hostname || 'N/A',
            mac: session['mac-address'] || session['mac'] || 'N/A',
            uptime: session.uptime || '0s',
            sessionId: session['.id'] || null,
            'bytes-in': session['bytes-in'] || '0',
            'bytes-out': session['bytes-out'] || '0'
          });
        }
      }

      return detailedSessions;
    } catch (error) {
      console.error('Error getting detailed active sessions:', error);
      return [];
    }
  }

  static async getSystemResources() {
    try {
      const conn = this.createConnection();
      await this.connectWithTimeout(conn);

      const resources = await conn.write('/system/resource/print');

      conn.close();

      if (!resources || resources.length === 0) {
        return null;
      }

      return resources[0];
    } catch (error) {
      console.error('Error getting system resources:', error);
      return null;
    }
  }

  static async getHotspotUserByUsername(username) {
    try {
      const conn = this.createConnection();
      await this.connectWithTimeout(conn);

      const users = await conn.write('/ip/hotspot/user/print', ['?name=' + username]);

      conn.close();

      if (!users || users.length === 0) {
        return null;
      }

      return users[0];
    } catch (error) {
      console.error('Error getting hotspot user by username:', error);
      return null;
    }
  }

  static async getAllHotspotUsers() {
    try {
      const conn = this.createConnection();
      await this.connectWithTimeout(conn);

      const users = await conn.write('/ip/hotspot/user/print');

      conn.close();

      return users || [];
    } catch (error) {
      console.error('Error getting all hotspot users:', error);
      return [];
    }
  }

  static async getActiveSession(hotspotUsername) {
    const sessions = await this.getAllActiveSessions(hotspotUsername);
    return sessions.length > 0 ? sessions[0] : null;
  }

  static async verifyCommentId(commentId) {
    try {
      const conn = this.createConnection();
      await this.connectWithTimeout(conn);

      const users = await conn.write('/ip/hotspot/user/print', ['?comment=' + commentId]);

      if (!users || users.length === 0) {
        const allUsers = await conn.write('/ip/hotspot/user/print');
        if (allUsers && allUsers.length > 0) {
          users = allUsers.filter(user => {
            const comment = user.comment || '';
            return comment.includes(`NIP:${commentId}`) || comment === commentId || comment.endsWith(`- NIP:${commentId}`);
          });
        }
      }

      conn.close();

      return {
        exists: users && users.length > 0,
        user: users && users.length > 0 ? users[0] : null
      };
    } catch (error) {
      return {
        exists: false,
        error: error.message
      };
    }
  }

  static async getHotspotProfiles() {
    try {
      const conn = this.createConnection();
      await this.connectWithTimeout(conn);

      const profiles = await conn.write('/ip/hotspot/user/profile/print');

      conn.close();

      return profiles || [];
    } catch (error) {
      const cantLoginMessage = formatMikrotikError(error);
      if (cantLoginMessage) {
        throw new Error(cantLoginMessage);
      }
      throw new Error(`Gagal mengambil daftar profile: ${error.message}`);
    }
  }

  static async createHotspotUser(username, password, commentId, profile = null) {
    try {
      const conn = this.createConnection();
      await this.connectWithTimeout(conn);

      const existingUsers = await conn.write('/ip/hotspot/user/print', ['?name=' + username]);
      if (existingUsers && existingUsers.length > 0) {
        conn.close();
        throw new Error('Username hotspot sudah digunakan');
      }

      const existingComments = await conn.write('/ip/hotspot/user/print', [
        '?comment=' + commentId
      ]);
      if (existingComments && existingComments.length > 0) {
        conn.close();
        throw new Error('Comment ID sudah digunakan');
      }

      const createParams = ['=name=' + username, '=password=' + password, '=comment=' + commentId];

      if (profile) {
        createParams.push('=profile=' + profile);
      }

      await conn.write('/ip/hotspot/user/add', createParams);

      conn.close();

      return await this.getHotspotUserByComment(commentId);
    } catch (error) {
      const cantLoginMessage = formatMikrotikError(error);
      if (cantLoginMessage) {
        throw new Error(cantLoginMessage);
      }
      throw new Error(`Gagal membuat user hotspot: ${error.message}`);
    }
  }

  static async deleteHotspotUser(mikrotikId) {
    try {
      const conn = this.createConnection();
      await this.connectWithTimeout(conn);

      await conn.write('/ip/hotspot/user/remove', ['=.id=' + mikrotikId]);

      conn.close();
      return { success: true, message: 'User hotspot berhasil dihapus' };
    } catch (error) {
      const cantLoginMessage = formatMikrotikError(error);
      if (cantLoginMessage) {
        throw new Error(cantLoginMessage);
      }
      throw new Error(`Gagal menghapus user hotspot: ${error.message}`);
    }
  }

  static async runDiagnostics(configOverride = {}) {
    const defaultConfig = this.getRouterConfig();
    const mergedConfig = {
      host: configOverride.host || defaultConfig.host,
      port: configOverride.port || defaultConfig.port || 8728,
      user: configOverride.user || defaultConfig.user,
      password: configOverride.password || defaultConfig.password
    };

    const diagnostics = {
      connectivity: {
        success: false,
        message: 'Belum dijalankan'
      },
      permissions: {
        success: false,
        message: 'Belum dijalankan'
      }
    };

    let conn = null;
    try {
      conn = new RouterOSAPI({
        host: mergedConfig.host,
        port: mergedConfig.port,
        user: mergedConfig.user,
        password: mergedConfig.password
      });

      await this.connectWithTimeout(conn);
      const resource = await conn.write('/system/resource/print');

      diagnostics.connectivity = {
        success: true,
        message: 'Berhasil terhubung ke router',
        details: {
          board: resource?.[0]?.['board-name'] || 'N/A',
          version: resource?.[0]?.version || 'N/A'
        }
      };

      try {
        const hotspotUsers = await conn.write('/ip/hotspot/user/print', ['=.proplist=name']);
        diagnostics.permissions = {
          success: true,
          message: `Akses hotspot OK (${hotspotUsers.length} user terbaca)`
        };
      } catch (permError) {
        diagnostics.permissions = {
          success: false,
          message: permError.message || 'Gagal membaca data hotspot'
        };
      }

      conn.close();
    } catch (error) {
      diagnostics.connectivity = {
        success: false,
        message: error.message || 'Tidak dapat terhubung dengan router'
      };
      if (!diagnostics.permissions.success) {
        diagnostics.permissions = {
          success: false,
          message: 'Tidak dijalankan karena gagal koneksi'
        };
      }
      if (conn) {
        try {
          conn.close();
        } catch (closeErr) {
          console.error('Error closing Mikrotik connection:', closeErr.message);
        }
      }
    }

    return diagnostics;
  }
}

module.exports = MikrotikService;

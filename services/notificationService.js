const Settings = require('../models/Settings');
const https = require('https');
const fs = require('fs');
const path = require('path');

function escapeHtml(text) {
  if (!text) {
    return '';
  }
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendTelegramMessage(message, botToken = null, chatId = null) {
  try {
    if (!botToken || !chatId) {
      const settings = Settings.get();

      if (!settings.telegram_bot_token || !settings.telegram_chat_id) {
        return {
          success: false,
          message: 'Telegram bot token or chat ID not configured'
        };
      }

      botToken = settings.telegram_bot_token.trim();
      chatId = settings.telegram_chat_id.trim();
    } else {
      botToken = botToken.trim();
      chatId = chatId.trim();
    }

    if (!botToken || !chatId) {
      return {
        success: false,
        message: 'Telegram bot token or chat ID is empty'
      };
    }

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    
    const payload = {
      chat_id: String(chatId),
      text: String(message),
      parse_mode: 'HTML',
      disable_web_page_preview: true
    };

    const data = JSON.stringify(payload);

    return new Promise((resolve) => {
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        port: 443,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data.length
        },
        timeout: 5000
      };

      const req = https.request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          try {
            const jsonResponse = JSON.parse(responseData);
            if (jsonResponse.ok) {
              resolve({
                success: true,
                message: 'Message sent successfully'
              });
            } else {
              const errorMsg = jsonResponse.description || 'Failed to send message';
              console.error(`[Telegram] API error: ${errorMsg}`);
              console.error('[Telegram] Full API response:', JSON.stringify(jsonResponse, null, 2));
              resolve({
                success: false,
                message: errorMsg
              });
            }
          } catch (error) {
            console.error('[Telegram] Invalid response from API:', error.message);
            console.error('[Telegram] Raw response:', responseData);
            resolve({
              success: false,
              message: 'Invalid response from Telegram API'
            });
          }
        });
      });

      req.on('error', (error) => {
        console.error('[Telegram] Network error:', error.message);
        resolve({
          success: false,
          message: error.message || 'Network error'
        });
      });

      req.on('timeout', () => {
        req.destroy();
        console.error('[Telegram] Request timeout');
        resolve({
          success: false,
          message: 'Request timeout'
        });
      });

      req.write(data);
      req.end();
    });
  } catch (error) {
    console.error('[Telegram] Error sending message:', error.message);
    return {
      success: false,
      message: error.message || 'Unknown error'
    };
  }
}

async function sendAccountLockAlert(username, ipAddress) {
  const message = `🚨 <b>BRUTE FORCE ALERT</b> 🚨

<b>Akun:</b> <code>${escapeHtml(username)}</code>
<b>IP:</b> <code>${escapeHtml(ipAddress || 'unknown')}</code>
<b>Status:</b> Dikunci selama 15 menit setelah 5x percobaan gagal.

<i>Segera periksa aktivitas mencurigakan ini.</i>`;

  try {
    await sendTelegramMessage(message);
  } catch (error) {
    console.error('[Telegram] Account lock alert error:', error.message);
  }
}

function formatActivityMessage(action, username, role, details, ipAddress) {
  const currentTime = new Date().toLocaleString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const roleEmoji = role === 'admin' ? '👑' : '👤';
  const actionEmoji = getActionEmoji(action);
  const actionName = getActionName(action);

  let message = `${actionEmoji} <b>${actionName}</b>\n\n`;
  message += `<b>User:</b> ${roleEmoji} <code>${escapeHtml(username || 'System')}</code>\n`;
  message += `<b>Role:</b> <b>${escapeHtml((role || 'SYSTEM').toUpperCase())}</b>\n`;
  
  if (details) {
    message += `<b>Detail:</b> <code>${escapeHtml(details)}</code>\n`;
  }
  
  message += `<b>IP Address:</b> <code>${escapeHtml(ipAddress || 'unknown')}</code>\n`;
  message += `<b>Time:</b> <code>${escapeHtml(currentTime)}</code>\n\n`;
  message += `<i>Mikrotik Hotspot Manager</i>`;

  return message;
}

function getActionEmoji(action) {
  const emojiMap = {
    'LOGIN': '🔐',
    'LOGOUT': '👋',
    'CREATE_USER': '➕',
    'UPDATE_USER': '✏️',
    'DELETE_USER': '🗑️',
    'UPDATE_SETTINGS': '⚙️',
    'UPDATE_PASSWORD': '🔑',
    'KICK_SESSION': '🔌',
    'BACKUP_DATABASE': '💾',
    'RESTORE_DATABASE': '📥'
  };
  return emojiMap[action] || '📝';
}

function getActionName(action) {
  const nameMap = {
    'LOGIN': 'Login Alert',
    'LOGOUT': 'Logout Alert',
    'CREATE_USER': 'User Created',
    'UPDATE_USER': 'User Updated',
    'DELETE_USER': 'User Deleted',
    'UPDATE_SETTINGS': 'Settings Updated',
    'UPDATE_PASSWORD': 'Password Updated',
    'KICK_SESSION': 'Session Kicked',
    'BACKUP_DATABASE': 'Database Backup',
    'RESTORE_DATABASE': 'Database Restored'
  };
  return nameMap[action] || 'Activity Log';
}

async function sendActivityNotification(action, username, role, details, ipAddress) {
  try {
    const message = formatActivityMessage(action, username, role, details, ipAddress);
    await sendTelegramMessage(message);
  } catch (error) {
    console.error(`[Telegram] Activity notification error (${action}):`, error.message);
  }
}

async function sendTelegramDocument(filePath, caption = '', botToken = null, chatId = null) {
  try {
    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        message: 'File not found: ' + filePath
      };
    }

    if (!botToken || !chatId) {
      const settings = Settings.get();

      if (!settings.telegram_bot_token || !settings.telegram_chat_id) {
        return {
          success: false,
          message: 'Telegram bot token or chat ID not configured'
        };
      }

      botToken = settings.telegram_bot_token.trim();
      chatId = settings.telegram_chat_id.trim();
    } else {
      botToken = botToken.trim();
      chatId = chatId.trim();
    }

    if (!botToken || !chatId) {
      return {
        success: false,
        message: 'Telegram bot token or chat ID is empty'
      };
    }

    const fileStats = fs.statSync(filePath);
    const fileSize = fileStats.size;
    const maxFileSize = 50 * 1024 * 1024;

    if (fileSize > maxFileSize) {
      return {
        success: false,
        message: `File size (${(fileSize / 1024 / 1024).toFixed(2)} MB) exceeds Telegram limit (50 MB)`
      };
    }

    const fileName = path.basename(filePath);
    const fileStream = fs.createReadStream(filePath);
    const url = `https://api.telegram.org/bot${botToken}/sendDocument`;

    return new Promise((resolve) => {
      const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2, 15);
      const urlObj = new URL(url);

      let formData = '';
      
      formData += `--${boundary}\r\n`;
      formData += `Content-Disposition: form-data; name="chat_id"\r\n\r\n`;
      formData += `${chatId}\r\n`;
      
      if (caption) {
        formData += `--${boundary}\r\n`;
        formData += `Content-Disposition: form-data; name="parse_mode"\r\n\r\n`;
        formData += `HTML\r\n`;
        
        formData += `--${boundary}\r\n`;
        formData += `Content-Disposition: form-data; name="caption"\r\n\r\n`;
        formData += `${caption}\r\n`;
      }
      
      formData += `--${boundary}\r\n`;
      formData += `Content-Disposition: form-data; name="document"; filename="${fileName}"\r\n`;
      formData += `Content-Type: application/octet-stream\r\n\r\n`;

      const options = {
        hostname: urlObj.hostname,
        port: 443,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        timeout: 60000
      };

      const req = https.request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          try {
            const jsonResponse = JSON.parse(responseData);
            if (jsonResponse.ok) {
              resolve({
                success: true,
                message: 'Document sent successfully',
                fileId: jsonResponse.result?.document?.file_id
              });
            } else {
              const errorMsg = jsonResponse.description || 'Failed to send document';
              console.error(`[Telegram] API error: ${errorMsg}`);
              console.error('[Telegram] Full API response:', JSON.stringify(jsonResponse, null, 2));
              resolve({
                success: false,
                message: errorMsg
              });
            }
          } catch (error) {
            console.error('[Telegram] Invalid response from API:', error.message);
            console.error('[Telegram] Raw response:', responseData.substring(0, 500));
            resolve({
              success: false,
              message: 'Invalid response from Telegram API'
            });
          }
        });
      });

      req.on('error', (error) => {
        console.error('[Telegram] Network error:', error.message);
        resolve({
          success: false,
          message: error.message || 'Network error'
        });
      });

      req.on('timeout', () => {
        req.destroy();
        console.error('[Telegram] Request timeout');
        resolve({
          success: false,
          message: 'Request timeout'
        });
      });

      req.write(formData);
      
      fileStream.on('data', (chunk) => {
        req.write(chunk);
      });

      fileStream.on('end', () => {
        req.write(`\r\n--${boundary}--\r\n`);
        req.end();
      });

      fileStream.on('error', (error) => {
        console.error('[Telegram] File read error:', error.message);
        req.destroy();
        resolve({
          success: false,
          message: 'Failed to read file: ' + error.message
        });
      });
    });
  } catch (error) {
    console.error('[Telegram] Error sending document:', error.message);
    return {
      success: false,
      message: error.message || 'Unknown error'
    };
  }
}

module.exports = {
  sendTelegramMessage,
  escapeHtml,
  sendAccountLockAlert,
  sendActivityNotification,
  formatActivityMessage,
  sendTelegramDocument
};


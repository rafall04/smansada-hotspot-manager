const Settings = require('../models/Settings');
const https = require('https');

/**
 * Escape HTML entities in user input to prevent breaking HTML formatting
 * Only escapes special characters, NOT the HTML tags themselves
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text
 */
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Send message to Telegram
 * @param {string} message - Message to send (should already contain HTML tags)
 * @param {string} [botToken] - Optional bot token (if not provided, reads from DB)
 * @param {string} [chatId] - Optional chat ID (if not provided, reads from DB)
 * @returns {Promise<{success: boolean, message: string}>}
 */
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

module.exports = {
  sendTelegramMessage,
  escapeHtml,
  sendAccountLockAlert
};


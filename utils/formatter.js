/**
 * Parse Mikrotik uptime string to total seconds
 * Handles formats: "2w1d", "10h30m", "50s", "1d2h3m4s", "HH:MM:SS"
 * @param {string} uptimeStr - Uptime string from Mikrotik
 * @returns {number} Total seconds
 */
function parseUptimeToSeconds(uptimeStr) {
  if (!uptimeStr || uptimeStr === '0s' || uptimeStr === '0') {
    return 0;
  }

  try {
    // Format: HH:MM:SS
    const timeParts = uptimeStr.split(':');
    if (timeParts.length === 3) {
      const hours = parseInt(timeParts[0], 10) || 0;
      const minutes = parseInt(timeParts[1], 10) || 0;
      const seconds = parseInt(timeParts[2], 10) || 0;
      return hours * 3600 + minutes * 60 + seconds;
    }

    // Format: 2w1d10h30m50s or 1d2h3m4s or 2h30m15s or 30m15s or 15s
    let totalSeconds = 0;

    // Week (w)
    const weekMatch = uptimeStr.match(/(\d+)w/);
    if (weekMatch) {
      totalSeconds += parseInt(weekMatch[1], 10) * 7 * 86400;
    }

    // Day (d)
    const dayMatch = uptimeStr.match(/(\d+)d/);
    if (dayMatch) {
      totalSeconds += parseInt(dayMatch[1], 10) * 86400;
    }

    // Hour (h)
    const hourMatch = uptimeStr.match(/(\d+)h/);
    if (hourMatch) {
      totalSeconds += parseInt(hourMatch[1], 10) * 3600;
    }

    // Minute (m)
    const minuteMatch = uptimeStr.match(/(\d+)m/);
    if (minuteMatch) {
      totalSeconds += parseInt(minuteMatch[1], 10) * 60;
    }

    // Second (s)
    const secondMatch = uptimeStr.match(/(\d+)s/);
    if (secondMatch) {
      totalSeconds += parseInt(secondMatch[1], 10);
    }

    return totalSeconds;
  } catch (error) {
    console.error('Error parsing uptime:', error, 'Input:', uptimeStr);
    return 0;
  }
}

/**
 * Format seconds to readable uptime string
 * @param {number} seconds - Total seconds
 * @returns {string} Formatted uptime (e.g., "2d 5h 30m")
 */
function formatUptime(seconds) {
  if (!seconds || seconds < 0) {
    return '0s';
  }

  if (seconds < 60) {
    return seconds + 's';
  }
  if (seconds < 3600) {
    return Math.floor(seconds / 60) + 'm';
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours + 'h ' + minutes + 'm';
  }
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 86400 % 3600) / 60);
  return days + 'd ' + hours + 'h ' + minutes + 'm';
}

/**
 * Format bytes to human readable format
 * @param {string|number} bytes - Bytes value
 * @returns {string} Formatted string (e.g., "1.5 MB")
 */
function formatBytes(bytes) {
  if (!bytes || bytes === '0' || bytes === 0) {
    return '0 B';
  }

  try {
    const bytesNum = parseInt(bytes, 10);
    if (isNaN(bytesNum) || bytesNum < 0) {
      return '0 B';
    }

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytesNum) / Math.log(k));

    return (Math.round((bytesNum / Math.pow(k, i)) * 100) / 100).toFixed(2) + ' ' + sizes[i];
  } catch (error) {
    console.error('Error formatting bytes:', error, 'Input:', bytes);
    return '0 B';
  }
}

/**
 * Format ISO/SQLite date string to Asia/Jakarta time (dd/MM/yyyy HH:mm:ss)
 * @param {string} isoString
 * @returns {string}
 */
function formatDateID(isoString) {
  if (!isoString) {
    return '-';
  }

  try {
    let normalized = isoString.trim();

    // Normalize SQLite format "YYYY-MM-DD HH:MM:SS" to ISO with UTC assumption
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(normalized)) {
      normalized = normalized.replace(' ', 'T') + 'Z';
    } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(normalized)) {
      normalized += 'Z';
    }

    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) {
      return '-';
    }

    const formatter = new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    const parts = formatter.formatToParts(date).reduce((acc, part) => {
      if (part.type !== 'literal') {
        acc[part.type] = part.value;
      }
      return acc;
    }, {});

    return `${parts.day || '00'}/${parts.month || '00'}/${parts.year || '0000'} ${parts.hour || '00'}:${parts.minute || '00'}:${parts.second || '00'}`;
  } catch (error) {
    console.error('Error formatting date:', error, 'Input:', isoString);
    return '-';
  }
}

module.exports = {
  parseUptimeToSeconds,
  formatUptime,
  formatBytes,
  formatDateID
};


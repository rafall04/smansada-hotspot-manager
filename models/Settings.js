const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'hotspot.db');
const db = new Database(dbPath);

class Settings {
  static get() {
    const result = db.prepare('SELECT * FROM settings WHERE id = 1').get();

    const columns = db.prepare('PRAGMA table_info(settings)').all();
    const columnNames = columns.map((col) => col.name);
    const hasSchoolName = columnNames.includes('school_name');

    if (!result) {
      return {
        router_ip: '192.168.88.1',
        router_port: 8728,
        router_user: 'admin',
        router_password_encrypted: '',
        hotspot_dns_name: '',
        telegram_bot_token: '',
        telegram_chat_id: '',
        school_name: 'SMAN 1 CONTOH'
      };
    }

    const hasTelegram = columnNames.includes('telegram_bot_token') && columnNames.includes('telegram_chat_id');

    if (columnNames.includes('router_password_encrypted')) {
      return {
        router_ip: result.router_ip || '192.168.88.1',
        router_port: result.router_port || 8728,
        router_user: result.router_user || 'admin',
        router_password_encrypted: result.router_password_encrypted || '',
        hotspot_dns_name: result.hotspot_dns_name || '',
        telegram_bot_token: hasTelegram ? (result.telegram_bot_token || '') : '',
        telegram_chat_id: hasTelegram ? (result.telegram_chat_id || '') : '',
        school_name: hasSchoolName ? (result.school_name || 'SMAN 1 CONTOH') : 'SMAN 1 CONTOH'
      };
    } else {
      return {
        router_ip: result.router_ip || '192.168.88.1',
        router_port: result.router_port || 8728,
        router_user: result.router_user || 'admin',
        router_password: result.router_password || 'admin',
        hotspot_dns_name: result.hotspot_dns_name || '',
        telegram_bot_token: hasTelegram ? (result.telegram_bot_token || '') : '',
        telegram_chat_id: hasTelegram ? (result.telegram_chat_id || '') : '',
        school_name: hasSchoolName ? (result.school_name || 'SMAN 1 CONTOH') : 'SMAN 1 CONTOH'
      };
    }
  }

  static update(data) {
    const existing = db.prepare('SELECT id FROM settings WHERE id = 1').get();
    const columns = db.prepare('PRAGMA table_info(settings)').all();
    const columnNames = columns.map((col) => col.name);

    const fields = [];
    const values = [];

    fields.push('router_ip = ?');
    values.push(data.router_ip);

    fields.push('router_port = ?');
    values.push(data.router_port);

    fields.push('router_user = ?');
    values.push(data.router_user);

    if (columnNames.includes('router_password_encrypted')) {
      fields.push('router_password_encrypted = ?');
      values.push(data.router_password_encrypted || '');
    } else if (columnNames.includes('router_password')) {
      fields.push('router_password = ?');
      values.push(data.router_password || 'admin');
    }

    if (columnNames.includes('hotspot_dns_name')) {
      fields.push('hotspot_dns_name = ?');
      values.push(data.hotspot_dns_name || '');
    } else {
      console.warn('[Settings.update] Column hotspot_dns_name does not exist in settings table');
    }

    if (columnNames.includes('telegram_bot_token')) {
      fields.push('telegram_bot_token = ?');
      values.push(data.telegram_bot_token || '');
    } else {
      console.warn('[Settings.update] Column telegram_bot_token does not exist in settings table. Run setup_db.js to add it.');
    }

    if (columnNames.includes('telegram_chat_id')) {
      fields.push('telegram_chat_id = ?');
      values.push(data.telegram_chat_id || '');
    } else {
      console.warn('[Settings.update] Column telegram_chat_id does not exist in settings table. Run setup_db.js to add it.');
    }

    if (columnNames.includes('school_name')) {
      fields.push('school_name = ?');
      values.push(data.school_name || 'SMAN 1 CONTOH');
    } else {
      console.warn('[Settings.update] Column school_name does not exist in settings table. Run setup_db.js to add it.');
    }

    if (existing) {
      const updateQuery = `UPDATE settings SET ${fields.join(', ')} WHERE id = 1`;
      const stmt = db.prepare(updateQuery);
      const result = stmt.run(...values);
      console.log('[Settings] Updated successfully');
      return result;
    } else {
      const insertFields = ['id', ...fields.map(f => f.split(' = ')[0])];
      const insertPlaceholders = '?, ' + fields.map(() => '?').join(', ');
      const insertValues = [1, ...values];
      const stmt = db.prepare(`INSERT INTO settings (${insertFields.join(', ')}) VALUES (${insertPlaceholders})`);
      return stmt.run(...insertValues);
    }
  }
}

module.exports = Settings;

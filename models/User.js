const { getDatabase } = require('./db');

class User {
  static findAll() {
    const db = getDatabase();
    return db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
  }

  static findById(id) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  }

  static findByUsername(username) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  }

  static findByComment(comment) {
    const db = getDatabase();
    const columns = db.prepare('PRAGMA table_info(users)').all();
    const columnNames = columns.map((col) => col.name);

    if (columnNames.includes('mikrotik_comment_id')) {
      return db.prepare('SELECT * FROM users WHERE mikrotik_comment_id = ?').get(comment);
    } else if (columnNames.includes('mikrotik_comment')) {
      return db.prepare('SELECT * FROM users WHERE mikrotik_comment = ?').get(comment);
    }
    return null;
  }

  static create(data) {
    const db = getDatabase();
    const columns = db.prepare('PRAGMA table_info(users)').all();
    const columnNames = columns.map((col) => col.name);

    const hasCommentId = columnNames.includes('mikrotik_comment_id');
    const hasComment = columnNames.includes('mikrotik_comment');

    const lowestAvailableId = this.findLowestAvailableId();
    const maxId = db.prepare('SELECT MAX(id) as max_id FROM users').get()?.max_id || 0;
    const useCustomId = lowestAvailableId > 0 && lowestAvailableId <= maxId + 1 && lowestAvailableId < maxId + 10;
    
    const fields = useCustomId ? ['id', 'username', 'password_hash'] : ['username', 'password_hash'];
    const values = useCustomId ? [lowestAvailableId, data.username, data.password_hash] : [data.username, data.password_hash];

    if (columnNames.includes('password_plain')) {
      fields.push('password_plain');
      values.push(data.password_plain || null);
    }

    if (columnNames.includes('password_encrypted_viewable')) {
      fields.push('password_encrypted_viewable');
      values.push(data.password_encrypted_viewable || null);
    }

    if (columnNames.includes('role')) {
      fields.push('role');
      values.push(data.role || 'guru');
    }

    if (columnNames.includes('must_change_password')) {
      fields.push('must_change_password');
      values.push(data.must_change_password !== undefined ? data.must_change_password : 0);
    }

    const commentValue = data.mikrotik_comment_id || data.mikrotik_comment;

    if (hasCommentId && hasComment) {
      const commentCol = columns.find((col) => col.name === 'mikrotik_comment');

      fields.push('mikrotik_comment_id');
      values.push(commentValue);

      if (commentCol && commentCol.notnull) {
        const realComment = data.mikrotik_comment || commentValue;

        if (!realComment) {
          throw new Error('mikrotik_comment is required but not provided');
        }
        fields.push('mikrotik_comment');
        values.push(realComment);
      }
    } else if (hasCommentId) {
      const commentCol = columns.find((col) => col.name === 'mikrotik_comment_id');
      if (commentCol && commentCol.notnull && !commentValue) {
        throw new Error('mikrotik_comment_id is required but not provided');
      }
      fields.push('mikrotik_comment_id');
      values.push(commentValue);
    } else if (hasComment) {
      const commentCol = columns.find((col) => col.name === 'mikrotik_comment');
      if (commentCol && commentCol.notnull && !commentValue) {
        throw new Error('mikrotik_comment is required but not provided');
      }
      fields.push('mikrotik_comment');
      values.push(commentValue);
    }

    const placeholders = fields.map(() => '?').join(', ');
    const stmt = db.prepare(`INSERT INTO users (${fields.join(', ')}) VALUES (${placeholders})`);
    return stmt.run(...values);
  }

  static update(id, data) {
    const db = getDatabase();
    const columns = db.prepare('PRAGMA table_info(users)').all();
    const columnNames = columns.map((col) => col.name);

    const fields = [];
    const values = [];

    if (data.username) {
      fields.push('username = ?');
      values.push(data.username);
    }
    if (data.password_hash) {
      fields.push('password_hash = ?');
      values.push(data.password_hash);
    }
    if (data.password_plain !== undefined && columnNames.includes('password_plain')) {
      fields.push('password_plain = ?');
      values.push(data.password_plain);
    }
    if (
      data.password_encrypted_viewable !== undefined &&
      columnNames.includes('password_encrypted_viewable')
    ) {
      fields.push('password_encrypted_viewable = ?');
      values.push(data.password_encrypted_viewable);
    }
    if (data.role && columnNames.includes('role')) {
      fields.push('role = ?');
      values.push(data.role);
    }

    const commentValue = data.mikrotik_comment_id || data.mikrotik_comment;
    if (commentValue !== undefined) {
      if (columnNames.includes('mikrotik_comment_id')) {
        fields.push('mikrotik_comment_id = ?');
        values.push(commentValue);
      } else if (columnNames.includes('mikrotik_comment')) {
        fields.push('mikrotik_comment = ?');
        values.push(commentValue);
      }
    }

    if (fields.length === 0) {
      return null;
    }

    values.push(id);
    const stmt = db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`);
    return stmt.run(...values);
  }

  static delete(id) {
    const db = getDatabase();
    return db.prepare('DELETE FROM users WHERE id = ?').run(id);
  }

  static countByRole(role) {
    const db = getDatabase();
    return db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get(role).count;
  }

  static findLowestAvailableId() {
    const db = getDatabase();
    const allIds = db.prepare('SELECT id FROM users ORDER BY id').all().map(row => row.id);
    
    if (allIds.length === 0) {
      return 1;
    }
    
    for (let i = 1; i <= allIds[allIds.length - 1]; i++) {
      if (!allIds.includes(i)) {
        return i;
      }
    }
    
    return allIds[allIds.length - 1] + 1;
  }

  static renumberIds() {
    const db = getDatabase();
    
    try {
      const allUsers = db.prepare('SELECT * FROM users ORDER BY id').all();
      
      console.log(`[User.renumberIds] Found ${allUsers.length} user(s) in database`);
      
      if (allUsers.length === 0) {
        console.log('[User.renumberIds] Database is empty, nothing to renumber');
        return { success: true, renumbered: 0, totalUsers: 0, message: 'No users to renumber' };
      }
      
      const columns = db.prepare('PRAGMA table_info(users)').all();
      const columnNames = columns.map((col) => col.name);
      const dataFields = columnNames.filter(c => c !== 'id');
      
      const indexes = db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='users'").all();
      const uniqueFields = [];
      indexes.forEach(idx => {
        if (idx.sql && idx.sql.toUpperCase().includes('UNIQUE')) {
          const match = idx.sql.match(/\(([^)]+)\)/);
          if (match) {
            const fields = match[1].split(',').map(f => f.trim().replace(/["`]/g, ''));
            uniqueFields.push(...fields);
          }
        }
      });
      
      const transaction = db.transaction(() => {
        let renumberedCount = 0;
        let newId = 1;
        const idMapping = new Map();
        const tempIdBase = 1000000;
        
        for (const user of allUsers) {
          if (user.id !== newId) {
            idMapping.set(user.id, newId);
            renumberedCount++;
          }
          newId++;
        }
        
        if (renumberedCount === 0) {
          return { success: true, renumbered: 0, totalUsers: allUsers.length, message: 'IDs already sequential' };
        }
        
        const usersToRenumber = Array.from(idMapping.entries()).map(([oldId, newId]) => ({
          oldId,
          newId,
          user: allUsers.find(u => u.id === oldId)
        })).filter(item => item.user);
        
        console.log(`[User.renumberIds] ${usersToRenumber.length} user(s) need renumbering`);
        
        if (usersToRenumber.length === 0) {
          return { success: true, renumbered: 0, totalUsers: allUsers.length, message: 'No users need renumbering' };
        }
        
        db.pragma('foreign_keys = OFF');
        
        try {
          for (const item of usersToRenumber) {
            const { oldId, newId, user } = item;
            const tempId = tempIdBase + oldId;
            
            console.log(`[User.renumberIds] Renumbering user ID ${oldId} -> ${newId} (temp: ${tempId})`);
            
            const columns = db.prepare('PRAGMA table_info(users)').all();
            const columnInfo = {};
            columns.forEach(col => {
              columnInfo[col.name] = col;
            });
            
            const userData = {};
            const fieldsToInsert = [];
            const valuesToInsert = [];
            
            dataFields.forEach(field => {
              const colInfo = columnInfo[field];
              const value = user[field];
              
              if (colInfo && colInfo.notnull && (value === null || value === undefined)) {
                if (field === 'mikrotik_comment' || field === 'mikrotik_comment_id') {
                  console.log(`[User.renumberIds] Skipping NOT NULL field ${field} with NULL value for user ${oldId}`);
                  return;
                }
              }
              
              fieldsToInsert.push(field);
              userData[field] = value;
            });
            
            const originalComment = user.mikrotik_comment || null;
            const originalCommentId = user.mikrotik_comment_id || null;
            const originalUsername = user.username || null;
            
            if (originalUsername) {
              const tempUsername = originalUsername + '_TEMP_' + oldId;
              console.log(`[User.renumberIds] Updating username for user ${oldId}: "${originalUsername}" -> "${tempUsername}"`);
              const updateUsernameStmt = db.prepare('UPDATE users SET username = ? WHERE id = ?');
              updateUsernameStmt.run(tempUsername, oldId);
            }
            
            if (originalComment) {
              const tempComment = originalComment + '_TEMP_' + oldId;
              console.log(`[User.renumberIds] Updating mikrotik_comment for user ${oldId}: "${originalComment}" -> "${tempComment}"`);
              const updateCommentStmt = db.prepare('UPDATE users SET mikrotik_comment = ? WHERE id = ?');
              updateCommentStmt.run(tempComment, oldId);
            }
            
            if (originalCommentId) {
              const tempCommentId = originalCommentId + '_TEMP_' + oldId;
              console.log(`[User.renumberIds] Updating mikrotik_comment_id for user ${oldId}: "${originalCommentId}" -> "${tempCommentId}"`);
              const updateCommentIdStmt = db.prepare('UPDATE users SET mikrotik_comment_id = ? WHERE id = ?');
              updateCommentIdStmt.run(tempCommentId, oldId);
            }
            
            userData.username = originalUsername;
            userData.mikrotik_comment = originalComment;
            userData.mikrotik_comment_id = originalCommentId;
            
            fieldsToInsert.forEach(field => {
              valuesToInsert.push(userData[field]);
            });
            
            const placeholders = fieldsToInsert.map(() => '?').join(', ');
            
            console.log(`[User.renumberIds] Inserting temp user with ID ${tempId}, fields: [${fieldsToInsert.join(', ')}]`);
            
            const insertStmt = db.prepare(`
              INSERT INTO users (id, ${fieldsToInsert.join(', ')})
              VALUES (?, ${placeholders})
            `);
            
            insertStmt.run(tempId, ...valuesToInsert);
            
            try {
              db.prepare('UPDATE audit_logs SET user_id = ? WHERE user_id = ?').run(tempId, oldId);
            } catch (auditError) {
              console.warn('[User.renumberIds] Could not update audit_logs:', auditError.message);
            }
            
            try {
              db.prepare('UPDATE login_attempts SET user_id = ? WHERE user_id = ?').run(tempId, oldId);
            } catch (loginError) {
              console.warn('[User.renumberIds] Could not update login_attempts:', loginError.message);
            }
            
            const deleteStmt = db.prepare('DELETE FROM users WHERE id = ?');
            deleteStmt.run(oldId);
          }
          
          for (const item of usersToRenumber) {
            const { oldId, newId } = item;
            const tempId = tempIdBase + oldId;
            
            const tempUser = db.prepare('SELECT * FROM users WHERE id = ?').get(tempId);
            if (!tempUser) {
              console.warn(`[User.renumberIds] Temp user with ID ${tempId} not found, skipping`);
              continue;
            }
            
            const columns = db.prepare('PRAGMA table_info(users)').all();
            const columnInfo = {};
            columns.forEach(col => {
              columnInfo[col.name] = col;
            });
            
            const tempUsername = tempUser.username || null;
            const tempComment = tempUser.mikrotik_comment || null;
            const tempCommentId = tempUser.mikrotik_comment_id || null;
            
            const originalUsername = tempUsername ? tempUsername.replace('_TEMP_' + oldId, '') : null;
            const originalComment = tempComment ? tempComment.replace('_TEMP_' + oldId, '') : null;
            const originalCommentId = tempCommentId ? tempCommentId.replace('_TEMP_' + oldId, '') : null;
            
            const userData = {};
            const fieldsToInsert = [];
            const valuesToInsert = [];
            
            dataFields.forEach(field => {
              const colInfo = columnInfo[field];
              let value = tempUser[field];
              
              if (field === 'username' && originalUsername) {
                value = originalUsername;
              } else if (field === 'mikrotik_comment' && originalComment) {
                value = originalComment;
              } else if (field === 'mikrotik_comment_id' && originalCommentId) {
                value = originalCommentId;
              }
              
              if (colInfo && colInfo.notnull && (value === null || value === undefined)) {
                if (field === 'mikrotik_comment' || field === 'mikrotik_comment_id') {
                  console.log(`[User.renumberIds] Skipping NOT NULL field ${field} with NULL value for temp user ${tempId}`);
                  return;
                }
              }
              
              fieldsToInsert.push(field);
              userData[field] = value;
            });
            
            fieldsToInsert.forEach(field => {
              valuesToInsert.push(userData[field]);
            });
            
            const placeholders = fieldsToInsert.map(() => '?').join(', ');
            
            console.log(`[User.renumberIds] Inserting final user with ID ${newId}, fields: [${fieldsToInsert.join(', ')}]`);
            
            const insertStmt = db.prepare(`
              INSERT INTO users (id, ${fieldsToInsert.join(', ')})
              VALUES (?, ${placeholders})
            `);
            
            insertStmt.run(newId, ...valuesToInsert);
            
            try {
              db.prepare('UPDATE audit_logs SET user_id = ? WHERE user_id = ?').run(newId, tempId);
            } catch (auditError) {
              console.warn('[User.renumberIds] Could not update audit_logs to final ID:', auditError.message);
            }
            
            try {
              db.prepare('UPDATE login_attempts SET user_id = ? WHERE user_id = ?').run(newId, tempId);
            } catch (loginError) {
              console.warn('[User.renumberIds] Could not update login_attempts to final ID:', loginError.message);
            }
            
            const deleteStmt = db.prepare('DELETE FROM users WHERE id = ?');
            deleteStmt.run(tempId);
          }
        } finally {
          db.pragma('foreign_keys = ON');
        }
        
        const maxId = allUsers.length;
        try {
          db.prepare(`DELETE FROM sqlite_sequence WHERE name = 'users'`).run();
          db.prepare(`INSERT INTO sqlite_sequence (name, seq) VALUES ('users', ?)`).run(maxId);
        } catch (seqError) {
          console.warn('[User.renumberIds] Could not update sqlite_sequence:', seqError.message);
        }
        
        return { success: true, renumbered: renumberedCount, totalUsers: allUsers.length };
      });
      
      return transaction();
    } catch (error) {
      console.error('[User.renumberIds] Error:', error);
      throw error;
    }
  }

  static bulkCreate(users) {
    if (!users || users.length === 0) return;

    const db = getDatabase();
    const columns = db.prepare('PRAGMA table_info(users)').all();
    const columnNames = columns.map((col) => col.name);

    const fields = [
      'username',
      'password_hash',
      'password_plain',
      'password_encrypted_viewable',
      'role',
      'mikrotik_comment_id',
      'must_change_password'
    ];

    if (columnNames.includes('mikrotik_comment')) {
      fields.push('mikrotik_comment');
    }

    const placeholders = fields.map((f) => '@' + f).join(', ');
    const insert = db.prepare(`
      INSERT INTO users (${fields.join(', ')})
      VALUES (${placeholders})
    `);

    const insertMany = db.transaction((usersToInsert) => {
      for (const user of usersToInsert) {
        const userData = { ...user };

        if (columnNames.includes('mikrotik_comment')) {
          userData.mikrotik_comment = user.mikrotik_comment || '';
        }

        insert.run(userData);
      }
    });

    insertMany(users);
  }
}

module.exports = User;

# Coding Standards & Best Practices

## Mikrotik Hotspot Management System v2.0

Dokumentasi standar coding berdasarkan **WORKFLOW.md v2.0** dan **Node.js Best Practices**.

---

## Table of Contents

1. [Project Structure](#project-structure)
2. [Code Style & Formatting](#code-style--formatting)
3. [Naming Conventions](#naming-conventions)
4. [Security Standards](#security-standards)
5. [Error Handling](#error-handling)
6. [Database Patterns](#database-patterns)
7. [Mikrotik Integration](#mikrotik-integration)
8. [Code Comments](#code-comments)
9. [File Organization](#file-organization)

---

## Project Structure

### Directory Layout (MVC Pattern)

```
project/
├── app.js                    # Application entry point
├── setup_db.js              # Database initialization
├── package.json             # Dependencies
├── .env                     # Environment variables (gitignored)
│
├── config/                  # Configuration files
│   └── database.js         # Database connection & setup
│
├── models/                  # Data Layer (Database Models)
│   ├── User.js             # User model (CRUD operations)
│   └── Settings.js         # Settings model (Router config)
│
├── controllers/             # Business Logic Layer
│   ├── adminController.js   # Admin operations
│   ├── authController.js    # Authentication
│   └── guruController.js     # Guru operations
│
├── services/                # Service Layer (External APIs)
│   └── mikrotikService.js   # Mikrotik API integration
│
├── middlewares/             # Express Middlewares
│   └── authMiddleware.js    # Authentication & Authorization
│
├── routes/                  # Route Definitions
│   └── index.js            # All application routes
│
├── utils/                   # Utility Functions
│   └── cryptoHelper.js     # Encryption utilities
│
├── views/                   # View Layer (EJS Templates)
│   ├── admin/
│   │   ├── dashboard.ejs
│   │   ├── settings.ejs
│   │   └── users.ejs
│   ├── guru/
│   │   ├── dashboard.ejs
│   │   └── settings.ejs
│   └── auth/
│       └── login.ejs
│
└── public/                  # Static Files
    └── css/
        └── style.css
```

### Layer Responsibilities

- **Models**: Database operations only (no business logic)
- **Controllers**: Request/response handling, validation, business logic orchestration
- **Services**: External API integration, reusable business logic
- **Middlewares**: Request preprocessing (auth, validation)
- **Routes**: Route definitions only (no logic)
- **Views**: Presentation layer only (no business logic)

---

## Code Style & Formatting

### General Rules

- **Indentation**: 2 spaces (no tabs)
- **Quotes**: Single quotes for strings
- **Semicolons**: Always use semicolons
- **Line Length**: Max 100 characters
- **Trailing Commas**: Use in multi-line objects/arrays

### JavaScript/Node.js Style

```javascript
// ✅ Good
const userId = 123;
const userData = {
  username: 'admin',
  role: 'admin'
};

async function getUserById(id) {
  try {
    return await User.findById(id);
  } catch (error) {
    console.error('Get user error:', error);
    throw error;
  }
}

// ❌ Bad
var userId = 123;
const userData = { username: 'admin', role: 'admin' };
function getUserById(id) {
  User.findById(id)
    .then((user) => user)
    .catch((err) => console.log(err));
}
```

### Variable Declarations

- Use `const` for immutable values
- Use `let` for mutable values
- Never use `var`
- Prefix unused parameters with `_`

```javascript
// ✅ Good
const userId = 123;
let counter = 0;
function handler(req, res, _next) {
  // _next is unused
}

// ❌ Bad
var userId = 123;
function handler(req, res, next) {
  // next is unused but not prefixed
}
```

### Async/Await Pattern

Always use async/await with proper error handling:

```javascript
// ✅ Good
static async createUser(req, res) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.redirect('/admin/users?error=Field required');
    }

    const user = await User.create({ username, password });
    res.redirect('/admin/users?success=User created');
  } catch (error) {
    console.error('Create user error:', error);
    res.redirect('/admin/users?error=' + encodeURIComponent(error.message));
  }
}

// ❌ Bad
static createUser(req, res) {
  User.create(req.body).then(user => {
    res.redirect('/admin/users');
  });
}
```

---

## Naming Conventions

### Files

- **Models**: `PascalCase.js` → `User.js`, `Settings.js`
- **Controllers**: `camelCaseController.js` → `adminController.js`
- **Services**: `camelCaseService.js` → `mikrotikService.js`
- **Middlewares**: `camelCaseMiddleware.js` → `authMiddleware.js`
- **Utils**: `camelCaseHelper.js` → `cryptoHelper.js`
- **Views**: `camelCase.ejs` → `dashboard.ejs`, `users.ejs`

### Variables & Functions

- **Variables**: `camelCase` → `userId`, `userData`
- **Functions**: `camelCase` → `getUserById()`, `createUser()`
- **Classes**: `PascalCase` → `User`, `AdminController`
- **Constants**: `UPPER_SNAKE_CASE` → `MAX_RETRY_COUNT`, `DEFAULT_PORT`

### Database

- **Tables**: `snake_case` plural → `users`, `settings`
- **Columns**: `snake_case` → `user_id`, `password_hash`
- **Primary Keys**: `id`
- **Foreign Keys**: `{table}_id` → `user_id`, `mikrotik_comment_id`

---

## Security Standards

### Password Handling (CRITICAL)

Based on WORKFLOW.md v2.0:

1. **Dual-Layer Storage** (Teacher Accounts):
   - `password_hash`: Bcrypt (one-way, for login validation)
   - `password_encrypted_viewable`: AES-256-CBC (two-way, for admin recovery)

2. **Router Credentials**:
   - Always encrypt before storing in database
   - Decrypt only when needed for API connection
   - Never log plain passwords

```javascript
// ✅ Good
const passwordHash = await bcrypt.hash(password, 10);
const passwordEncrypted = cryptoHelper.encrypt(password);

User.create({
  password_hash: passwordHash,
  password_encrypted_viewable: passwordEncrypted
});

// ❌ Bad
User.create({
  password: password, // NEVER store plain password
  password_hash: password // Wrong: not hashed
});
```

### Environment Variables

- Never hardcode secrets in source code
- Use `.env` file (gitignored)
- Validate required env vars on startup
- Use strong encryption keys (32 bytes for AES-256)

```javascript
// ✅ Good
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
  throw new Error('ENCRYPTION_KEY must be 32 bytes');
}

// ❌ Bad
const ENCRYPTION_KEY = 'my-secret-key'; // NEVER hardcode
```

### Input Validation

- Always validate user input
- Use parameterized queries (prevent SQL injection)
- Sanitize input before use
- Validate required fields

```javascript
// ✅ Good
static async createUser(req, res) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.redirect('/admin/users?error=Field required');
  }

  if (username.length < 3) {
    return res.redirect('/admin/users?error=Username too short');
  }

  // Use parameterized query
  const user = await User.create({ username, password });
}

// ❌ Bad
static async createUser(req, res) {
  const user = await User.create(req.body); // No validation
}
```

---

## Error Handling

### Try-Catch Pattern

Always use try-catch for async operations:

```javascript
// ✅ Good
static async updateUser(req, res) {
  try {
    const userId = req.params.id;
    const { username, password } = req.body;

    if (!username) {
      return res.redirect('/admin/users?error=Username required');
    }

    await User.update(userId, { username, password });
    res.redirect('/admin/users?success=User updated');
  } catch (error) {
    console.error('Update user error:', error);
    res.redirect('/admin/users?error=' + encodeURIComponent(error.message));
  }
}

// ❌ Bad
static async updateUser(req, res) {
  await User.update(req.params.id, req.body);
  res.redirect('/admin/users');
}
```

### Error Messages

- User-facing: Bahasa Indonesia, user-friendly
- Logging: English, detailed for debugging
- Never expose internal errors to users

```javascript
// ✅ Good
catch (error) {
  console.error('Database error:', error);
  res.redirect('/admin/users?error=Gagal menyimpan data');
}

// ❌ Bad
catch (error) {
  res.redirect('/admin/users?error=' + error.stack); // Exposes stack trace
}
```

---

## Database Patterns

### Model Pattern

Models should be stateless with static methods:

```javascript
// ✅ Good
class User {
  static findById(id) {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  }

  static create(data) {
    const stmt = db.prepare('INSERT INTO users ...');
    return stmt.run(data);
  }

  static update(id, data) {
    const stmt = db.prepare('UPDATE users SET ... WHERE id = ?');
    return stmt.run(data, id);
  }
}

// ❌ Bad
class User {
  constructor() {
    this.db = db; // Stateful
  }

  findById(id) {
    return this.db.query(`SELECT * FROM users WHERE id = ${id}`); // SQL injection risk
  }
}
```

### Dynamic Schema Handling

Handle schema changes gracefully:

```javascript
// ✅ Good
static create(data) {
  const columns = db.prepare('PRAGMA table_info(users)').all();
  const columnNames = columns.map((col) => col.name);

  const fields = [];
  const values = [];
  const placeholders = [];

  Object.keys(data).forEach((key) => {
    if (columnNames.includes(key)) {
      fields.push(key);
      values.push(data[key]);
      placeholders.push('?');
    }
  });

  const sql = `INSERT INTO users (${fields.join(', ')}) VALUES (${placeholders.join(', ')})`;
  return db.prepare(sql).run(...values);
}

// ❌ Bad
static create(data) {
  return db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(
    data.username,
    data.password
  ); // Breaks if schema changes
}
```

---

## Mikrotik Integration

### On-Demand Connection Pattern

Based on WORKFLOW.md - never keep connections open:

```javascript
// ✅ Good
static async getUserByComment(commentId) {
  const conn = this.createConnection();
  await conn.connect();

  try {
    const users = await conn.write('/ip/hotspot/user/print', [
      '?comment=' + commentId,
    ]);
    return users.length > 0 ? users[0] : null;
  } finally {
    conn.close(); // Always close
  }
}

// ❌ Bad
static async getUserByComment(commentId) {
  // Using global connection - connection leak risk
  return await globalMikrotikConn.write('/ip/hotspot/user/print', [
    '?comment=' + commentId,
  ]);
}
```

### Router Config Decryption

Decrypt only when needed:

```javascript
// ✅ Good
static getRouterConfig() {
  const settings = Settings.get();

  let routerPassword = 'admin';
  if (settings.router_password_encrypted) {
    routerPassword = cryptoHelper.decrypt(settings.router_password_encrypted);
  }

  return {
    host: settings.router_ip,
    port: settings.router_port,
    user: settings.router_user,
    password: routerPassword, // Decrypted only here
  };
}

// ❌ Bad
static getRouterConfig() {
  const settings = Settings.get();
  return {
    password: settings.router_password_encrypted, // Wrong: not decrypted
  };
}
```

### Identifier Consistency

Always use Comment as foreign key, never Name:

```javascript
// ✅ Good
static async updateHotspotUser(mikrotikId, username, password, commentId) {
  await conn.write('/ip/hotspot/user/set', [
    '=.id=' + mikrotikId,
    '=name=' + username,
    '=password=' + password,
    '=comment=' + commentId, // Preserve comment
  ]);
}

// ❌ Bad
static async updateHotspotUser(username, password) {
  await conn.write('/ip/hotspot/user/set', [
    '?name=' + username, // Wrong: using name as identifier
    '=password=' + password,
  ]);
}
```

---

## Code Comments

### When to Comment

- Complex business logic
- Non-obvious code decisions
- Security-critical sections
- API documentation (JSDoc)

### Comment Style

```javascript
// ✅ Good
// Check for legacy mikrotik_comment column for backward compatibility
const hasLegacyColumn = columnNames.includes('mikrotik_comment');

/**
 * Encrypts password using AES-256-CBC for admin recovery feature
 * @param {string} plaintext - Password to encrypt
 * @returns {string} Hex-encoded ciphertext
 */
function encrypt(plaintext) {
  // Implementation
}

// ❌ Bad
// This function encrypts password
function encrypt(plaintext) {
  // Encrypt
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  // More encrypt
  return encrypted;
}
```

### Remove Unnecessary Comments

- Remove obvious comments
- Remove commented-out code
- Remove TODO comments that are outdated
- Keep only meaningful documentation

---

## File Organization

### Controller Structure

```javascript
// ✅ Good Structure
const User = require('../models/User');
const Settings = require('../models/Settings');
const MikrotikService = require('../services/mikrotikService');
const cryptoHelper = require('../utils/cryptoHelper');
const bcrypt = require('bcrypt');

class AdminController {
  /**
   * Dashboard page
   */
  static async dashboard(req, res) {
    // Implementation
  }

  /**
   * Settings page
   */
  static async settingsPage(req, res) {
    // Implementation
  }

  /**
   * Update settings
   */
  static async updateSettings(req, res) {
    // Implementation
  }
}

module.exports = AdminController;
```

### Service Structure

```javascript
// ✅ Good Structure
const { RouterOSAPI } = require('node-routeros-v2');
const Settings = require('../models/Settings');
const cryptoHelper = require('../utils/cryptoHelper');

class MikrotikService {
  /**
   * Get router configuration (decrypts password)
   */
  static getRouterConfig() {
    // Implementation
  }

  /**
   * Create Mikrotik connection
   */
  static createConnection() {
    // Implementation
  }

  /**
   * Test connection to Mikrotik
   */
  static async testConnection() {
    // Implementation
  }
}

module.exports = MikrotikService;
```

---

## Code Quality Rules

### Required Practices

1. **Always validate input** before processing
2. **Always handle errors** with try-catch
3. **Always close connections** (Mikrotik, database)
4. **Always encrypt sensitive data** before storing
5. **Always use parameterized queries** (prevent SQL injection)
6. **Always check authentication** in protected routes
7. **Always log errors** for debugging
8. **Never expose internal errors** to users
9. **Never hardcode secrets** in source code
10. **Never store plain passwords**

### Code Review Checklist

- [ ] Input validation implemented
- [ ] Error handling with try-catch
- [ ] Security best practices followed
- [ ] No hardcoded secrets
- [ ] Proper async/await usage
- [ ] Database queries use parameters
- [ ] Connections properly closed
- [ ] Meaningful error messages
- [ ] Code follows naming conventions
- [ ] No unnecessary comments

---

## Tools & Automation

### ESLint

Run before committing:

```bash
npm run lint
npm run lint:fix
```

### Prettier

Format code before committing:

```bash
npm run format
npm run format:check
```

### Pre-commit Checklist

1. Run `npm run lint`
2. Run `npm run format`
3. Test functionality
4. Check for console.log (remove if not needed)
5. Remove debug code
6. Update documentation if needed

---

## Git Commit Messages

### Format

```
<type>: <subject>

<body>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code refactoring
- `docs`: Documentation changes
- `style`: Code style changes (formatting)
- `test`: Test additions/changes
- `chore`: Maintenance tasks

### Examples

```
✅ Good:
- feat: add password reveal feature for admin
- fix: resolve modal flickering on edit user
- refactor: improve error handling in User model
- docs: update WORKFLOW.md with encryption details

❌ Bad:
- update
- fix bug
- changes
- wip
```

---

## References

- [WORKFLOW.md](./WORKFLOW.md) - Project workflow documentation
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
- [Express.js Security](https://expressjs.com/en/advanced/best-practice-security.html)
- [Clean Code JavaScript](https://github.com/ryanmcdermott/clean-code-javascript)

---

**Last Updated**: 2024
**Version**: 2.0
**Based on**: WORKFLOW.md v2.0

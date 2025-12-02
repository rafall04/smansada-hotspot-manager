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
10. [Maintenance, Debugging, & Resilience Standards](#maintenance-debugging--resilience-standards)

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

## Maintenance, Debugging, & Resilience Standards

### Overview

This section defines critical standards for preventing common production issues, ensuring data integrity, maintaining UI consistency, and enabling effective debugging. These rules are **MANDATORY** and must be followed in all code changes.

---

### 1. Critical Flow Control (Preventing ERR_HTTP_HEADERS_SENT)

#### The Golden Rule of Return

**Rule:** A function must never have more than one response path without an explicit `return` at every single exit point.

**Enforcement:** Every controller method that sends an HTTP response **MUST** use `return` immediately after the response call.

```javascript
// ✅ Good - Every response path has explicit return
static async createUser(req, res) {
  if (res.headersSent) return; // Guard check at entry
  
  try {
    const validationResponse = respondValidationErrors(req, res, '/admin/users');
    if (validationResponse) {
      return validationResponse; // MUST return
    }
    
    if (res.headersSent) return; // Guard after validation
    
    const { username, password } = req.body;
    
    if (!username || !password) {
      req.flash('error', 'Username dan password harus diisi');
      return res.redirect('/admin/users'); // MUST return
    }
    
    await User.create({ username, password });
    req.flash('success', 'User berhasil dibuat');
    return res.redirect('/admin/users'); // MUST return
  } catch (error) {
    if (res.headersSent) return; // Guard in catch block
    console.error('[CreateUser] Error:', error);
    req.flash('error', 'Gagal membuat user');
    return res.redirect('/admin/users'); // MUST return
  }
}

// ❌ Bad - Missing return statements
static async createUser(req, res) {
  try {
    if (!req.body.username) {
      res.redirect('/admin/users?error=Required'); // Missing return
    }
    
    await User.create(req.body);
    res.redirect('/admin/users?success=Created'); // Missing return
  } catch (error) {
    res.redirect('/admin/users?error=' + error.message); // Missing return
  }
}
```

#### Guard Checks (Mandatory Pattern)

**Rule:** All critical asynchronous controller methods **MUST** include guard checks at strategic points.

**Required Guard Check Locations:**

1. **At function entry** (if middleware might have sent response)
2. **After validation checks** (before processing)
3. **Before each response call** (redundant but safe)
4. **After async operations** (`await` statements)
5. **In catch blocks** (before sending error responses)

```javascript
// ✅ Good - Comprehensive guard checks
static async updateSettings(req, res) {
  if (res.headersSent) return; // 1. Entry guard
  
  try {
    const validationResponse = respondValidationErrors(req, res, '/admin/settings');
    if (validationResponse) {
      return validationResponse;
    }
    
    if (res.headersSent) return; // 2. After validation
    
    const settings = await Settings.get(); // Async operation
    if (res.headersSent) return; // 3. After async
    
    await Settings.update(req.body); // Async operation
    if (res.headersSent) return; // 4. After async
    
    req.flash('success', 'Pengaturan berhasil disimpan');
    return res.redirect('/admin/settings'); // 5. Explicit return
  } catch (error) {
    if (res.headersSent) return; // 5. Catch guard
    console.error('[UpdateSettings] Error:', error);
    req.flash('error', 'Gagal menyimpan pengaturan');
    return res.redirect('/admin/settings'); // Explicit return
  }
}
```

#### Why This Matters

Express.js throws `ERR_HTTP_HEADERS_SENT` if you attempt to send a response after headers have already been sent. This error:
- Crashes the application
- Prevents proper error handling
- Creates poor user experience
- Makes debugging difficult

**Prevention Checklist:**
- [ ] Every `res.redirect()` has `return` before it
- [ ] Every `res.json()` has `return` before it
- [ ] Every `res.send()` has `return` before it
- [ ] Every `res.render()` has `return` before it
- [ ] Guard checks at all critical points
- [ ] No code execution after response is sent

---

### 2. Data Integrity and Form Protection

#### Critical Form Anchors

**Rule:** Define and maintain a list of **Critical Form Anchors** that must never be removed or modified without explicit verification.

**Critical Form Anchors List:**

| Form | Critical Fields | Purpose |
|------|----------------|---------|
| Admin/Users | `username`, `password`, `mikrotik_comment_id` | User creation/authentication |
| Admin/Settings | `router_ip`, `router_user`, `router_password_encrypted` | Mikrotik connection |
| Guru/Dashboard | `mikrotik_comment_id`, `username`, `password` | Hotspot user management |

#### Form Field Integrity Check (Mandatory Process)

**Rule:** Any refactoring that touches forms **MUST** begin with a **Form Field Integrity Check**.

**Process:**

1. **Before Changes:**
   ```bash
   # Document current form fields
   - List all <input> fields in the form
   - List all req.body accesses in controller
   - List all validation rules in middlewares/validators.js
   ```

2. **During Changes:**
   - Verify each field is still present in the form
   - Verify each field is still mapped in the controller
   - Verify validation rules are still in place

3. **After Changes:**
   ```bash
   # Verification checklist
   - [ ] All critical fields present in form
   - [ ] All critical fields mapped in controller (req.body.fieldName)
   - [ ] All critical fields have validation rules
   - [ ] Form submission works end-to-end
   - [ ] No console errors in browser
   - [ ] No server errors in logs
   ```

**Example Integrity Check:**

```javascript
// ✅ Good - Before refactoring, document all fields
/**
 * FORM FIELD INTEGRITY CHECK - Admin/Users Form
 * 
 * Current Fields (DO NOT REMOVE):
 * - username (required, text input)
 * - password (required, password input)
 * - mikrotik_comment_id (required, text input)
 * 
 * Controller Mapping:
 * - req.body.username → User.create({ username })
 * - req.body.password → bcrypt.hash() → User.create({ password_hash })
 * - req.body.mikrotik_comment_id → User.create({ mikrotik_comment_id })
 * 
 * Validation Rules:
 * - middlewares/validators.js: validateUserCreation()
 *   - username: required, minLength(3), maxLength(50)
 *   - password: required, minLength(8)
 *   - mikrotik_comment_id: required, matches pattern
 */
```

#### Redundancy Rule (Preventing Duplicate Fields)

**Rule:** Prohibit the creation of two separate input fields that store the same type of essential identifier.

**Examples:**

```javascript
// ❌ Bad - Redundant fields
// Form has both:
<input name="nip" />        // Teacher NIP
<input name="mikrotik_comment_id" /> // Also stores NIP

// ❌ Bad - Confusing dual storage
// Controller tries to use both:
const nip = req.body.nip || req.body.mikrotik_comment_id;

// ✅ Good - Single source of truth
// Form has only:
<input name="mikrotik_comment_id" /> // Single identifier field

// Controller uses only:
const mikrotikCommentId = req.body.mikrotik_comment_id;
```

**Enforcement:**
- Before adding a new identifier field, check if an equivalent field already exists
- If equivalent exists, use the existing field or consolidate
- Document the relationship if fields must coexist (with clear reason)

---

### 3. Environmental & Persistence Resilience

#### Production Deployment Rules (Linux Environments)

**Rule:** The application **MUST NEVER** run under the `root` user, and the project directory **MUST** reside outside the `/root/` folder.

**Mandatory Requirements:**

1. **User Account:**
   ```bash
   # ✅ Good - Create dedicated user
   sudo useradd -m -s /bin/bash hotspot-manager
   sudo su - hotspot-manager
   
   # ❌ Bad - Running as root
   sudo su - root  # NEVER DO THIS
   ```

2. **Project Directory:**
   ```bash
   # ✅ Good - Project in user home directory
   /home/hotspot-manager/smansada-hotspot-manager/
   
   # ✅ Good - Project in standard location
   /opt/smansada-hotspot-manager/
   
   # ❌ Bad - Project in root directory
   /root/smansada-hotspot-manager/  # NEVER DO THIS
   ```

3. **File Ownership:**
   ```bash
   # ✅ Good - Correct ownership
   sudo chown -R hotspot-manager:hotspot-manager /home/hotspot-manager/smansada-hotspot-manager
   sudo chmod -R 755 /home/hotspot-manager/smansada-hotspot-manager
   
   # Verify ownership
   ls -la /home/hotspot-manager/smansada-hotspot-manager/hotspot.db
   # Should show: hotspot-manager hotspot-manager
   ```

4. **PM2 Configuration:**
   ```bash
   # ✅ Good - Run as dedicated user
   pm2 start app.js --name smansada-hotspot --user hotspot-manager
   
   # ❌ Bad - Running as root
   sudo pm2 start app.js --name smansada-hotspot  # NEVER DO THIS
   ```

**Why This Matters:**

- Running as `root` creates security vulnerabilities
- Files in `/root/` may have restrictive permissions
- SQLite I/O errors (`SQLITE_IOERR_DELETE_NOENT`) often occur due to permission issues
- Proper ownership ensures database writes succeed

#### SQLite Stability (Database Connection Management)

**Rule:** Use **shared singleton database connection** with proper journal mode to prevent `SQLITE_IOERR_DELETE_NOENT` errors.

**Mandatory Configuration:**

1. **Shared Connection Pattern:**
   ```javascript
   // ✅ Good - models/db.js (singleton pattern)
   let db = null;
   
   function getDatabase() {
     if (db && db.open) {
       return db;
     }
     
     db = new Database(dbPath, {
       timeout: 10000,
       verbose: process.env.NODE_ENV === 'development' ? console.log : null
     });
     
     // CRITICAL: Set durability settings
     db.pragma('synchronous = FULL');
     db.pragma('journal_mode = DELETE'); // Avoid WAL mode issues
     
     return db;
   }
   
   // ❌ Bad - Multiple connections
   // Each model creates its own connection
   const db1 = new Database(dbPath); // User.js
   const db2 = new Database(dbPath); // Settings.js
   const db3 = new Database(dbPath); // AuditLog.js
   ```

2. **Journal Mode:**
   ```javascript
   // ✅ Good - DELETE mode (simpler, more reliable)
   db.pragma('journal_mode = DELETE');
   
   // ⚠️ Use WAL mode only if:
   // - Multiple processes need concurrent read access
   // - You have proper file permission management
   // - You handle WAL checkpointing correctly
   
   // ❌ Bad - WAL mode without proper management
   db.pragma('journal_mode = WAL'); // Can cause permission issues
   ```

3. **Durability Settings:**
   ```javascript
   // ✅ Good - Maximum durability
   db.pragma('synchronous = FULL'); // Wait for OS confirmation
   
   // ❌ Bad - Fast but unsafe
   db.pragma('synchronous = OFF'); // Data loss risk
   ```

**Error Prevention Checklist:**
- [ ] Single shared database connection (models/db.js)
- [ ] All models use `getDatabase()` from models/db.js
- [ ] Journal mode set to `DELETE` (not WAL)
- [ ] Synchronous mode set to `FULL`
- [ ] Proper file ownership (not root)
- [ ] Project directory outside `/root/`
- [ ] PM2 runs as dedicated user

---

### 4. UI Consistency and Scope

#### Global Stylesheet Rule

**Rule:** All aesthetic CSS (`@keyframes`, `.card-clean`, utility classes) **MUST** reside in global stylesheets (`/public/css/style.css`).

**Enforcement:** Prohibit the use of inline `<style>` blocks in EJS view files.

```html
<!-- ✅ Good - styles.css -->
<!-- public/css/style.css -->
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.spin {
  animation: spin 1s linear infinite;
}

.card-clean {
  background: var(--bs-card-bg);
  border: 1px solid var(--bs-border-color);
  border-radius: 8px;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
}

<!-- views/admin/users.ejs -->
<link rel="stylesheet" href="/css/style.css">
<i class="bi bi-arrow-clockwise spin"></i>

<!-- ❌ Bad - Inline style block -->
<!-- views/admin/users.ejs -->
<style>
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  .spin {
    animation: spin 1s linear infinite;
  }
</style>
```

**Why This Matters:**

- Inline styles create scope conflicts (animation not working on other pages)
- Duplicate CSS definitions increase maintenance burden
- Global stylesheet ensures consistency across all pages
- Easier to debug and modify styles

**CSS Organization:**

```
public/css/style.css
├── CSS Variables (colors, spacing)
├── Global Animations (@keyframes)
├── Utility Classes (.card-clean, .spin)
├── Component Styles (modals, forms)
└── Responsive Breakpoints
```

**Pre-commit Checklist:**
- [ ] No `<style>` blocks in EJS files
- [ ] All animations defined in `style.css`
- [ ] All utility classes in `style.css`
- [ ] CSS works across all pages (not just one page)

---

### 5. Debugging & Logging

#### Standardized Error Logging

**Rule:** Implement standardized, actionable error logging with **Execution Context** information.

**Required Log Format:**

```javascript
// ✅ Good - Comprehensive error logging
catch (error) {
  const executionContext = {
    user: process.env.USER || 'unknown',
    cwd: process.cwd(),
    nodeVersion: process.version,
    timestamp: new Date().toISOString(),
    errorCode: error.code,
    errorMessage: error.message
  };
  
  console.error('[ComponentName] CRITICAL ERROR:', {
    message: error.message,
    code: error.code,
    stack: error.stack,
    context: executionContext
  });
  
  // User-friendly message
  req.flash('error', 'Terjadi kesalahan sistem. Silakan hubungi administrator.');
  return res.redirect('/path');
}
```

#### Execution Context Logging (Critical Errors)

**Rule:** Mandate logging the current **Execution Context** whenever a critical error occurs.

**Critical Error Types:**
- `SQLITE_IOERR` / `SQLITE_IOERR_DELETE_NOENT`
- `SQLITE_BUSY`
- API timeouts (Mikrotik connection)
- Authentication failures
- Database connection failures

**Example Implementation:**

```javascript
// ✅ Good - SQLite I/O Error with context
catch (error) {
  if (error.code && error.code.includes('SQLITE_IOERR')) {
    const context = {
      user: process.env.USER || 'unknown',
      cwd: process.cwd(),
      dbPath: path.join(__dirname, '..', 'hotspot.db'),
      fileExists: fs.existsSync(path.join(__dirname, '..', 'hotspot.db')),
      fileStats: fs.existsSync(path.join(__dirname, '..', 'hotspot.db')) 
        ? fs.statSync(path.join(__dirname, '..', 'hotspot.db')) 
        : null
    };
    
    console.error('[Settings.get] ⚠️  SQLITE I/O ERROR:', {
      error: error.message,
      code: error.code,
      context: context,
      instructions: [
        '1. Check file ownership: ls -l hotspot.db',
        '2. Fix ownership: sudo chown -R [USER]:[USER] /path/to/project',
        '3. Fix permissions: sudo chmod -R 775 /path/to/project',
        '4. Ensure project is NOT in /root/ directory',
        '5. Ensure app runs as dedicated user (not root)'
      ]
    });
  }
}

// ✅ Good - Mikrotik API Timeout with context
catch (error) {
  if (error.message && error.message.includes('timeout')) {
    const context = {
      routerIp: settings.router_ip,
      routerPort: settings.router_port,
      routerUser: settings.router_user,
      timestamp: new Date().toISOString(),
      nodeVersion: process.version
    };
    
    console.error('[MikrotikService] Connection timeout:', {
      error: error.message,
      context: context,
      suggestions: [
        '1. Check router IP address is correct',
        '2. Verify router is accessible from server',
        '3. Check firewall rules',
        '4. Verify router API port (default: 8728)'
      ]
    });
  }
}
```

#### Logging Levels

**Standard Logging Levels:**

```javascript
// ✅ Good - Appropriate log levels
console.log('[Component] Info message');           // General information
console.warn('[Component] Warning message');       // Non-critical issues
console.error('[Component] Error message');       // Errors that need attention
console.error('[Component] CRITICAL:', error);     // Critical errors (with context)
```

**When to Log:**

| Level | When to Use | Example |
|-------|-------------|---------|
| `console.log` | Normal operation info | "User created successfully" |
| `console.warn` | Non-critical issues | "Could not verify PRAGMA settings" |
| `console.error` | Errors requiring attention | "Database connection failed" |
| `console.error` (CRITICAL) | Critical errors with context | SQLITE_IOERR with execution context |

**Pre-commit Checklist:**
- [ ] All critical errors include execution context
- [ ] Error messages are actionable (include instructions)
- [ ] User-facing messages are in Bahasa Indonesia
- [ ] Internal logs are in English
- [ ] No sensitive data in logs (passwords, tokens)

---

### Maintenance Standards Summary

#### Pre-Refactoring Checklist

Before making any changes to forms, controllers, or database code:

- [ ] **Flow Control:** Verify all response paths have `return` statements
- [ ] **Form Integrity:** Document all form fields and their mappings
- [ ] **Environment:** Verify deployment follows Linux user rules
- [ ] **Database:** Verify shared connection pattern is used
- [ ] **UI:** Verify no inline styles in EJS files
- [ ] **Logging:** Verify error logging includes execution context

#### Post-Refactoring Verification

After making changes:

- [ ] **Flow Control:** Test all response paths (success, error, validation)
- [ ] **Form Integrity:** Verify all critical fields work end-to-end
- [ ] **Database:** Test database operations (create, read, update)
- [ ] **UI:** Test UI across all pages (not just modified page)
- [ ] **Logging:** Verify error messages are helpful and actionable
- [ ] **No Console Errors:** Check browser console and server logs

---

**Last Updated**: 2025-01-02
**Version**: 2.1
**Based on**: WORKFLOW.md v2.0 + Production Issue Resolution

---

## References

- [WORKFLOW.md](./WORKFLOW.md) - Project workflow documentation
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
- [Express.js Security](https://expressjs.com/en/advanced/best-practice-security.html)
- [Clean Code JavaScript](https://github.com/ryanmcdermott/clean-code-javascript)

# Project Rules & Standards Summary

## ✅ Yang Sudah Diterapkan

### 1. Coding Standards Documentation

- ✅ **CODING_STANDARDS.md** - Dokumentasi lengkap berdasarkan WORKFLOW.md v2.0
- ✅ Mencakup: Project Structure, Code Style, Naming Conventions, Security, Error Handling, Database Patterns, Mikrotik Integration
- ✅ Best practices Node.js dan Clean Code principles

### 2. Code Quality Tools

- ✅ **ESLint** - Linting dengan rules yang ketat
- ✅ **Prettier** - Code formatting otomatis
- ✅ **EditorConfig** - Konsistensi editor settings
- ✅ Scripts: `npm run lint`, `npm run lint:fix`, `npm run format`

### 3. Code Cleanup

- ✅ Hapus komentar DEBUG yang tidak relevan
- ✅ Hapus console.log debug statements
- ✅ Bersihkan komentar yang tidak perlu
- ✅ Format semua file dengan Prettier
- ✅ Fix semua linting errors

### 4. Project Structure

- ✅ Struktur MVC yang jelas dan terorganisir
- ✅ Separation of concerns (Models, Controllers, Services, Middlewares)
- ✅ File naming conventions yang konsisten

## 📋 Rules yang Harus Diikuti

### Code Style

- **Indentation**: 2 spaces
- **Quotes**: Single quotes
- **Semicolons**: Always use
- **Line Length**: Max 100 characters
- **Variables**: `const` untuk immutable, `let` untuk mutable
- **Functions**: `async/await` dengan proper error handling

### Naming Conventions

- **Models**: `PascalCase.js` → `User.js`
- **Controllers**: `camelCaseController.js` → `adminController.js`
- **Services**: `camelCaseService.js` → `mikrotikService.js`
- **Variables**: `camelCase` → `userId`
- **Constants**: `UPPER_SNAKE_CASE` → `MAX_RETRY_COUNT`

### Security (CRITICAL)

- ✅ Dual-layer password storage (bcrypt + AES-256)
- ✅ Router credentials encryption
- ✅ Input validation
- ✅ Parameterized queries (prevent SQL injection)
- ✅ Never hardcode secrets
- ✅ Never store plain passwords

### Error Handling

- ✅ Always use try-catch for async operations
- ✅ User-facing messages: Bahasa Indonesia
- ✅ Logging: English, detailed
- ✅ Never expose internal errors to users

### Database Patterns

- ✅ Stateless models with static methods
- ✅ Dynamic schema handling for backward compatibility
- ✅ Parameterized queries only

### Mikrotik Integration

- ✅ On-demand connection (never keep open)
- ✅ Always close connections in finally block
- ✅ Use Comment as foreign key (never Name)
- ✅ Decrypt router password only when needed

## 🚀 Pre-commit Checklist

Sebelum commit code, pastikan:

1. ✅ Run `npm run lint` - No errors
2. ✅ Run `npm run format` - Code formatted
3. ✅ Remove debug code (console.log, TODO comments)
4. ✅ Remove unnecessary comments
5. ✅ Test functionality
6. ✅ Follow naming conventions
7. ✅ Follow security best practices

## 📚 Dokumentasi

- **CODING_STANDARDS.md** - Complete coding standards
- **WORKFLOW.md** - Project workflow v2.0
- **SETUP.md** - Setup guide
- **STRUCTURE.md** - Project structure explanation

## 🔧 Tools Configuration

- **.eslintrc.json** - ESLint rules
- **.prettierrc.json** - Prettier formatting
- **.editorconfig** - Editor consistency

## 📝 Git Commit Format

```
<type>: <subject>

<body>
```

Types: `feat`, `fix`, `refactor`, `docs`, `style`, `test`, `chore`

---

**Status**: ✅ All rules and standards implemented
**Last Updated**: 2024
**Version**: 2.0

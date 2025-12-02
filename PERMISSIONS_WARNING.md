# ⚠️ CRITICAL: File System Permissions Requirement

## **ABSOLUTE NECESSITY: Correct Linux User & File Ownership**

This application **MUST** be run under a Linux user with proper file ownership of the project directory and database file. Failure to do so will result in **`SQLITE_IOERR_DELETE_NOENT`** errors, causing:

- ❌ Settings to be lost (router password, configuration)
- ❌ Mikrotik connection failures (`CANTLOGIN` errors)
- ❌ Database corruption
- ❌ Application crashes

## **Root Cause**

SQLite requires write access to:
1. The database file (`hotspot.db`)
2. The database journal file (`hotspot.db-journal`)
3. The directory containing the database

If the Node.js process user does not have ownership or proper permissions, SQLite cannot create temporary files or write to the database, resulting in `SQLITE_IOERR_DELETE_NOENT`.

## **Solution: Fix Permissions Before Running**

### Step 1: Identify the User Running Node.js/PM2

```bash
# Check PM2 processes
ps aux | grep pm2

# Check current user
whoami

# Check Node.js processes
ps aux | grep node
```

### Step 2: Fix Ownership

```bash
# Replace [YOUR_USER] with the actual user (e.g., root, ubuntu, www-data)
# Replace /path/to/project with your actual project path
sudo chown -R [YOUR_USER]:[YOUR_USER] /path/to/project/smansada-hotspot-manager
```

**Example:**
```bash
sudo chown -R root:root /root/smansada-hotspot-manager
```

### Step 3: Fix Permissions

```bash
# Set directory permissions (read, write, execute for owner and group)
sudo chmod -R 775 /root/smansada-hotspot-manager

# Set database file permissions (read, write for owner and group)
sudo chmod 664 /root/smansada-hotspot-manager/hotspot.db
```

### Step 4: Verify Permissions

```bash
# Check directory permissions
ls -ld /root/smansada-hotspot-manager
# Should show: drwxrwxr-x (775)

# Check database file permissions
ls -l /root/smansada-hotspot-manager/hotspot.db
# Should show: -rw-rw-r-- (664)
```

### Step 5: Re-run Database Setup

```bash
cd /path/to/project/smansada-hotspot-manager
npm run setup-db
```

### Step 6: Restart Application

```bash
# If using PM2
pm2 restart smansada-hotspot

# If using npm start directly
npm start
```

## **Prevention: Best Practices**

1. **Always run Node.js/PM2 as the same user that owns the project directory**
2. **Never run as root unless the project directory is owned by root**
3. **Use a dedicated user for production (e.g., `hotspot-manager` or `www-data`)**
4. **Set up proper permissions during initial deployment**

## **Troubleshooting**

If you still encounter `SQLITE_IOERR_DELETE_NOENT` after fixing permissions:

1. **Check SELinux (if enabled):**
   ```bash
   getenforce
   # If Enforcing, may need to set SELinux context
   ```

2. **Check disk space:**
   ```bash
   df -h
   ```

3. **Check filesystem mount options:**
   ```bash
   mount | grep $(df /path/to/project | tail -1 | awk '{print $1}')
   ```

4. **Run diagnostic script:**
   ```bash
   npm run db:diagnose
   ```

## **Development vs Production**

- **Development:** Run as your regular user, ensure you own the project directory
- **Production:** Use a dedicated service user (e.g., `hotspot-manager`) with proper ownership

---

**Remember:** This is not optional. Without proper permissions, the application **WILL** fail intermittently with database errors.


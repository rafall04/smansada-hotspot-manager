const path = require('path');

// CRITICAL: Resolve absolute paths to ensure PM2 uses correct working directory
// This fixes session store issues where PM2 may use different cwd than npm start
const projectRoot = path.resolve(__dirname);
const scriptPath = path.join(projectRoot, 'app.js');

module.exports = {
  apps: [
    {
      name: 'smansada-hotspot',
      script: scriptPath, // Use absolute path for script
      cwd: projectRoot, // Use absolute path for working directory
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
        // Router configuration (PRIMARY - most reliable)
        // Uncomment and set these values for maximum reliability:
        // ROUTER_IP: '192.168.88.1',
        // ROUTER_PORT: '8728',
        // ROUTER_USER: 'admin',
        // ROUTER_PASSWORD_ENCRYPTED: 'encrypted_hex_string_here'
        // Generate encrypted password: node scripts/setup-router-env.js your_password
      },
      error_file: path.join(projectRoot, 'logs', 'pm2-error.log'),
      out_file: path.join(projectRoot, 'logs', 'pm2-out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000
    }
  ]
};


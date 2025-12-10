const path = require('path');

const projectRoot = path.resolve(__dirname);
const scriptPath = path.join(projectRoot, 'app.js');

module.exports = {
  apps: [
    {
      name: 'smansada-hotspot',
      script: scriptPath,
      cwd: projectRoot,
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
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


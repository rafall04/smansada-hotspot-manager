function getClientIp(req) {
  if (!req) {
    return 'unknown';
  }

  let ip = null;

  if (req.headers) {
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
      const ips = forwardedFor.split(',').map((ip) => ip.trim()).filter((ip) => ip && ip !== '127.0.0.1' && ip !== '::1' && ip !== '::ffff:127.0.0.1');
      if (ips.length > 0) {
        ip = ips[0];
      }
    }
  }

  if (!ip && req.headers && req.headers['x-real-ip']) {
    const realIp = req.headers['x-real-ip'].trim();
    if (realIp && realIp !== '127.0.0.1' && realIp !== '::1' && realIp !== '::ffff:127.0.0.1') {
      ip = realIp;
    }
  }

  if (!ip && req.ip) {
    const reqIp = String(req.ip).trim();
    if (reqIp && reqIp !== '127.0.0.1' && reqIp !== '::1' && reqIp !== '::ffff:127.0.0.1') {
      ip = reqIp;
    }
  }

  if (!ip && req.connection && req.connection.remoteAddress) {
    const remoteAddr = String(req.connection.remoteAddress).trim();
    if (remoteAddr && remoteAddr !== '127.0.0.1' && remoteAddr !== '::1' && remoteAddr !== '::ffff:127.0.0.1') {
      ip = remoteAddr;
    }
  }

  if (!ip && req.socket && req.socket.remoteAddress) {
    const socketAddr = String(req.socket.remoteAddress).trim();
    if (socketAddr && socketAddr !== '127.0.0.1' && socketAddr !== '::1' && socketAddr !== '::ffff:127.0.0.1') {
      ip = socketAddr;
    }
  }

  if (ip && (ip.startsWith('::ffff:') || ip.startsWith('::'))) {
    ip = ip.replace(/^::ffff:/, '');
  }

  return ip || 'unknown';
}

module.exports = { getClientIp };


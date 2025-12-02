/**
 * Middleware untuk mengecek apakah user sudah login
 */
function isAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {
    if (req.session.mustChangePassword) {
      const allowedPaths = ['/guru/initial-password-change', '/guru/update-initial-password', '/logout'];
      if (!allowedPaths.includes(req.path)) {
        return res.redirect('/guru/initial-password-change');
      }
    }
    return next();
  }
  res.redirect('/login');
}

/**
 * Middleware untuk mengecek apakah user adalah admin
 */
function isAdmin(req, res, next) {
  if (req.session && req.session.role === 'admin') {
    return next();
  }
  if (req.session && req.session.userId) {
    return res.redirect('/guru/dashboard');
  }
  res.redirect('/login');
}

/**
 * Middleware untuk mengecek apakah user adalah guru
 */
function isGuru(req, res, next) {
  if (req.session && req.session.role === 'guru') {
    return next();
  }
  if (req.session && req.session.role === 'admin') {
    return res.redirect('/admin/dashboard');
  }
  res.redirect('/login');
}

module.exports = {
  isAuthenticated,
  isAdmin,
  isGuru
};

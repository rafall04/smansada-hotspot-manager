function isAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {
    // Check both session flag AND database to prevent stale session issues
    if (req.session.mustChangePassword) {
      // Double-check database to ensure must_change_password is still 1
      // This prevents issues where session flag is stale but database is already updated
      const User = require('../models/User');
      const user = User.findById(req.session.userId);
      
      if (user && user.must_change_password === 1) {
        // Database confirms password change is still required
        const allowedPaths = ['/guru/initial-password-change', '/guru/update-initial-password', '/logout'];
        if (!allowedPaths.includes(req.path)) {
          return res.redirect('/guru/initial-password-change');
        }
      } else {
        // Database says password already changed - clear stale session flag
        req.session.mustChangePassword = false;
        req.session.save((err) => {
          if (err) {
            console.error('[AuthMiddleware] Session save error:', err.message);
          }
        });
      }
    }
    return next();
  }
  res.redirect('/login');
}

function isAdmin(req, res, next) {
  if (req.session && req.session.role === 'admin') {
    return next();
  }
  if (req.session && req.session.userId) {
    return res.redirect('/guru/dashboard');
  }
  res.redirect('/login');
}

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

const express = require('express');
const router = express.Router();

// Controllers
const AuthController = require('../controllers/authController');
const AdminController = require('../controllers/adminController');
const GuruController = require('../controllers/guruController');
const validators = require('../middlewares/validators');

// Middlewares
const { isAuthenticated, isAdmin, isGuru } = require('../middlewares/authMiddleware');

// ==================== Auth Routes ====================
router.get('/login', AuthController.loginPage);
router.post('/login', AuthController.login);
router.post('/logout', AuthController.logout);

// ==================== Admin Routes ====================
router.get('/admin/dashboard', isAuthenticated, isAdmin, AdminController.dashboard);

router.get('/admin/settings', isAuthenticated, isAdmin, AdminController.settingsPage);
router.post(
  '/admin/settings',
  isAuthenticated,
  isAdmin,
  validators.validateAdminSettings,
  AdminController.updateSettings
);
router.post(
  '/admin/settings/run-diagnostics',
  isAuthenticated,
  isAdmin,
  validators.validateAdminSettings,
  AdminController.runDiagnostics
);

router.get('/admin/users', isAuthenticated, isAdmin, AdminController.usersPage);
router.get('/admin/users/profiles', isAuthenticated, isAdmin, AdminController.getProfiles);
router.post(
  '/admin/users/verify-comment',
  isAuthenticated,
  isAdmin,
  AdminController.verifyCommentId
);
router.post(
  '/admin/users/reveal-password',
  isAuthenticated,
  isAdmin,
  AdminController.revealPassword
);
router.post(
  '/admin/users',
  isAuthenticated,
  isAdmin,
  validators.validateAdminUserCreate,
  AdminController.createUser
);
router.post(
  '/admin/users/import',
  isAuthenticated,
  isAdmin,
  require('../middlewares/multerUpload').single('userFile'),
  AdminController.importUsers
);
router.post(
  '/admin/users/:id',
  isAuthenticated,
  isAdmin,
  validators.validateAdminUserUpdate,
  AdminController.updateUser
);
router.post('/admin/users/:id/delete', isAuthenticated, isAdmin, AdminController.deleteUser);

// Admin Management Routes (Separate from regular users)
router.get('/admin/admins', isAuthenticated, isAdmin, AdminController.manageAdminsPage);
router.post('/admin/admins', isAuthenticated, isAdmin, AdminController.createAdminUser);
router.post('/admin/admins/:id', isAuthenticated, isAdmin, AdminController.updateAdminUser);
router.post('/admin/admins/:id/delete', isAuthenticated, isAdmin, AdminController.deleteAdminUser);

router.get('/admin/api/top-users', isAuthenticated, isAdmin, AdminController.getTopUsers);
router.post('/admin/api/test-telegram', isAuthenticated, isAdmin, AdminController.testTelegram);
router.get('/admin/api/logs', isAuthenticated, isAdmin, AdminController.getLogsApi);
router.get('/admin/api/live-devices', isAuthenticated, isAdmin, AdminController.getActiveDevicesApi);

// ==================== Guru Routes ====================
router.get('/guru/dashboard', isAuthenticated, isGuru, GuruController.dashboard);
router.get('/guru/settings', isAuthenticated, isGuru, GuruController.settingsPage);
router.post('/guru/settings', isAuthenticated, isGuru, GuruController.updateSettings);
router.post('/guru/update-web-account', isAuthenticated, isGuru, GuruController.updateWebAccount);
router.post(
  '/guru/update-hotspot',
  isAuthenticated,
  isGuru,
  validators.validateGuruHotspot,
  GuruController.updateHotspotCredentials
);
router.post(
  '/guru/update-password',
  isAuthenticated,
  isGuru,
  validators.validateGuruHotspot,
  GuruController.updateHotspotCredentials
);
router.post('/guru/kick-session', isAuthenticated, isGuru, GuruController.kickSession);
router.post('/guru/kick-session/:sessionId', isAuthenticated, isGuru, GuruController.kickSessionById);
router.get('/guru/initial-password-change', isAuthenticated, isGuru, GuruController.initialPasswordChangePage);
router.post('/guru/update-initial-password', isAuthenticated, isGuru, GuruController.updateInitialPassword);

// ==================== Root Redirect ====================
router.get('/', (req, res) => {
  if (req.session && req.session.userId) {
    if (req.session.role === 'admin') {
      return res.redirect('/admin/dashboard');
    }
    return res.redirect('/guru/dashboard');
  }
  res.redirect('/login');
});

module.exports = router;

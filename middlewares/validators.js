const { body } = require('express-validator');
const { isIP, isFQDN } = require('validator');

const validateIpOrHost = (value) => {
  if (!value) {
    throw new Error('IP atau hostname wajib diisi');
  }
  const trimmed = value.trim();
  if (isIP(trimmed, 4) || isFQDN(trimmed)) {
    return true;
  }
  throw new Error('Gunakan IP v4 atau hostname yang valid');
};

const validateCommentId = body('mikrotik_comment_id')
  .trim()
  .notEmpty()
  .withMessage('Mikrotik Comment ID wajib diisi')
  .bail()
  .matches(/^[a-zA-Z0-9_-]+$/)
  .withMessage('Comment ID hanya boleh berisi huruf, angka, garis bawah, atau strip');

const validateHotspotUsername = (field = 'hotspot_username') =>
  body(field)
    .optional({ checkFalsy: true })
    .isLength({ min: 3 })
    .withMessage('Username minimal 3 karakter')
    .bail()
    .matches(/^[^\s]+$/)
    .withMessage('Username tidak boleh mengandung spasi');

const validateAdminUserCreate = [
  body('username').trim().notEmpty().withMessage('Username wajib diisi'),
  body('password')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 6 })
    .withMessage('Password minimal 6 karakter'),
  validateCommentId,
  body('user_type')
    .trim()
    .notEmpty()
    .withMessage('Tipe user wajib dipilih')
    .bail()
    .isIn(['existing', 'new'])
    .withMessage('Tipe user tidak valid'),
  body('hotspot_username')
    .if(body('user_type').equals('new'))
    .optional({ checkFalsy: true })
    .isLength({ min: 3 })
    .withMessage('Username hotspot minimal 3 karakter')
    .bail()
    .matches(/^[^\s]+$/)
    .withMessage('Username hotspot tidak boleh mengandung spasi'),
  body('hotspot_password')
    .if(body('user_type').equals('new'))
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 6 })
    .withMessage('Password hotspot minimal 6 karakter')
];

const validateAdminUserUpdate = [
  body('username').trim().notEmpty().withMessage('Username wajib diisi'),
  validateCommentId
];

const validateAdminSettings = [
  body('router_ip').custom(validateIpOrHost),
  body('router_port')
    .toInt()
    .isInt({ min: 1, max: 65535 })
    .withMessage('Port harus antara 1-65535'),
  body('router_user').trim().notEmpty().withMessage('Username router wajib diisi'),
  body('hotspot_dns_name')
    .optional({ checkFalsy: true })
    .matches(/^[a-zA-Z0-9.-]+$/)
    .withMessage('Hostname tidak valid'),
  body('school_name')
    .optional({ checkFalsy: true })
    .isLength({ min: 3, max: 100 })
    .withMessage('Nama sekolah minimal 3 karakter')
];

const validateGuruHotspot = [
  validateHotspotUsername('username'),
  body('password')
    .optional({ checkFalsy: true })
    .isLength({ min: 6 })
    .withMessage('Password minimal 6 karakter')
];

module.exports = {
  validateAdminUserCreate,
  validateAdminUserUpdate,
  validateAdminSettings,
  validateGuruHotspot
};


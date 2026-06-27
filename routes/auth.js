const express = require('express');
const router = express.Router();
const {
  register,
  login,
  registerStaff,           // ✅ NEW
  getStaffList,            // ✅ NEW
  updateStaffPermissions   // ✅ NEW
} = require('../controllers/authController');
const { authenticate, hasPermission } = require('../middleware/authMiddleware');

// ============================================================
// Public Routes (no authentication required)
// ============================================================
router.post('/register', register);
router.post('/login', login);

// ============================================================
// Staff Management Routes (admin only)
// ============================================================
// Create a new staff account
router.post(
  '/register-staff',
  authenticate,
  hasPermission('manage_staff'),
  registerStaff
);

// Get list of all staff users
router.get(
  '/staff',
  authenticate,
  hasPermission('manage_staff'),
  getStaffList
);

// Update staff permissions
router.put(
  '/staff/:id/permissions',
  authenticate,
  hasPermission('manage_staff'),
  updateStaffPermissions
);

module.exports = router;

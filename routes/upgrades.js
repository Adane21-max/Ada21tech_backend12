const express = require('express');
const router = express.Router();
const { authenticate, isAdmin } = require('../middleware/authMiddleware');
const {
  requestUpgrade,
  getUpgradeRequests,
  approveUpgrade,
  rejectUpgrade,
  getMyPendingRequests
} = require('../controllers/upgradeController');

// Student routes
router.post('/request', authenticate, requestUpgrade);
router.get('/pending', authenticate, getMyPendingRequests);   // ✅

// Admin routes
router.get('/', authenticate, isAdmin, getUpgradeRequests);
router.put('/:id/approve', authenticate, isAdmin, approveUpgrade);
router.put('/:id/reject', authenticate, isAdmin, rejectUpgrade);

module.exports = router;

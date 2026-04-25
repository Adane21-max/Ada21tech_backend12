const express = require('express');
const router = express.Router();
const { authenticate, isAdmin } = require('../middleware/authMiddleware');
const {
  requestUpgrade,
  getUpgradeRequests,
  approveUpgrade,
  rejectUpgrade,
  getMyPendingRequests   // <-- add this
} = require('../controllers/upgradeController');

// Student: request an upgrade
router.post('/request', authenticate, requestUpgrade);

// Admin: view all requests
router.get('/', authenticate, isAdmin, getUpgradeRequests);

// Admin: approve request
router.put('/:id/approve', authenticate, isAdmin, approveUpgrade);

// Admin: reject request
router.put('/:id/reject', authenticate, isAdmin, rejectUpgrade);

router.get('/pending', authenticate, getMyPendingRequests);

module.exports = router;

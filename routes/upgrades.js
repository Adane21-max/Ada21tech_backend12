const express = require('express');
const router = express.Router();
const { authenticate, isAdmin } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/upgradeController');

router.post('/request', authenticate, ctrl.requestUpgrade);
router.get('/pending', authenticate, ctrl.getMyPendingRequests);
router.get('/', authenticate, isAdmin, ctrl.getUpgradeRequests);
router.put('/:id/approve', authenticate, isAdmin, ctrl.approveUpgrade);
router.put('/:id/reject', authenticate, isAdmin, ctrl.rejectUpgrade);

module.exports = router;

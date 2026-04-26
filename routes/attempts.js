const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { saveAttempt, getStudentAttempts, getAttemptDetails } = require('../controllers/attemptController');
router.post('/', authenticate, saveAttempt);
router.get('/', authenticate, getStudentAttempts);
router.get('/:id', authenticate, getAttemptDetails);

module.exports = router;

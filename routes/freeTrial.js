// Free Trial Routes 
const express = require('express');
const router = express.Router();
const { authenticate, isAdmin } = require('../middleware/authMiddleware');
const {
  createFreeTrialQuestion,
  getFreeTrialQuestions,
  updateFreeTrialQuestion,
  deleteFreeTrialQuestion
} = require('../controllers/freeTrialController');

router.get('/', getFreeTrialQuestions); // public for free trial
router.post('/', authenticate, isAdmin, createFreeTrialQuestion);
router.put('/:id', authenticate, isAdmin, updateFreeTrialQuestion);
router.delete('/:id', authenticate, isAdmin, deleteFreeTrialQuestion);

module.exports = router;
const express = require('express');
const router = express.Router();
const { authenticate, isAdmin } = require('../middleware/authMiddleware');
const {
  createQuestionType,
  getQuestionTypes,
  updateQuestionType,
  deleteQuestionType,
  getVisibleTypesForStudent,
  getQuestionTypeById,
  getScheduledQuizzesForStudent   // <-- NEW
} = require('../controllers/questionTypeController');

// Student routes (authenticated, but not admin)
router.get('/visible', authenticate, getVisibleTypesForStudent);
router.get('/scheduled', authenticate, getScheduledQuizzesForStudent);   // <-- NEW

// Admin routes
router.post('/', authenticate, isAdmin, createQuestionType);
router.get('/', authenticate, isAdmin, getQuestionTypes);

// Routes with :id parameter come after specific named routes
router.get('/:id', authenticate, getQuestionTypeById);
router.put('/:id', authenticate, isAdmin, updateQuestionType);
router.delete('/:id', authenticate, isAdmin, deleteQuestionType);

module.exports = router;
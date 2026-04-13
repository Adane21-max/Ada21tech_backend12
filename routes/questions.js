// Question Routes 
const express = require('express');
const router = express.Router();
const { authenticate, isAdmin } = require('../middleware/authMiddleware');
const {
  createQuestion,
  getQuestions,
  updateQuestion,
  deleteQuestion
} = require('../controllers/questionController');
const { bulkCreateQuestions } = require('../controllers/questionController');

// Public: get questions (filtered)
router.get('/', getQuestions);

// Admin only
router.post('/', authenticate, isAdmin, createQuestion);
router.put('/:id', authenticate, isAdmin, updateQuestion);
router.delete('/:id', authenticate, isAdmin, deleteQuestion);
router.post('/bulk', authenticate, isAdmin, bulkCreateQuestions);

module.exports = router;
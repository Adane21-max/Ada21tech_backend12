// Question Routes 
const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
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

// Admin only – with image upload
router.post('/', authenticate, isAdmin, upload.single('image'), createQuestion);
router.put('/:id', authenticate, isAdmin, upload.single('image'), updateQuestion);
router.delete('/:id', authenticate, isAdmin, deleteQuestion);
router.post('/bulk', authenticate, isAdmin, bulkCreateQuestions);

module.exports = router;

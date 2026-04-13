const express = require('express');
const router = express.Router();
const { authenticate, isAdmin } = require('../middleware/authMiddleware');
const {
  getAllStudents,
  approveStudent,
  rejectStudent,
  updateStudentStatus,
  getStudentsWithQuizTypeCount   // <-- ADD THIS IMPORT
} = require('../controllers/studentController');

// Existing routes
router.get('/', authenticate, isAdmin, getAllStudents);
router.put('/:id/approve', authenticate, isAdmin, approveStudent);
router.put('/:id/reject', authenticate, isAdmin, rejectStudent);
router.put('/:id/status', authenticate, isAdmin, updateStudentStatus);

// NEW route for grade summary with quiz type counts
router.get('/with-quiz-types', authenticate, isAdmin, getStudentsWithQuizTypeCount);

module.exports = router;
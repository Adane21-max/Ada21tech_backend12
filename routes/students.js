const express = require('express');
const router = express.Router();
const { authenticate, isAdmin } = require('../middleware/authMiddleware');
const {
  getAllStudents,
  approveStudent,
  rejectStudent,
  updateStudentStatus,
  getStudentsWithQuizTypeCount,
  deleteStudent,
  getLeaderboard,
  getMyLevels,
  getCurrentLevel
} = require('../controllers/studentController');

// Routes accessible by any authenticated student
router.get('/leaderboard', authenticate, getLeaderboard);
router.get('/my-levels', authenticate, getMyLevels);
router.get('/current-level', authenticate, getCurrentLevel);

// Admin‑only routes
router.get('/', authenticate, isAdmin, getAllStudents);
router.get('/with-quiz-types', authenticate, isAdmin, getStudentsWithQuizTypeCount);
router.put('/:id/approve', authenticate, isAdmin, approveStudent);
router.put('/:id/reject', authenticate, isAdmin, rejectStudent);
router.put('/:id/status', authenticate, isAdmin, updateStudentStatus);
router.delete('/:id', authenticate, isAdmin, deleteStudent);

module.exports = router;

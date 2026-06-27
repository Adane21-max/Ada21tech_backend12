const express = require('express');
const router = express.Router();
const { authenticate, hasPermission } = require('../middleware/authMiddleware');
const {
  getAllStudents,
  approveStudent,
  rejectStudent,
  updateStudentStatus,
  getStudentsWithQuizTypeCount,
  deleteStudent,
  getLeaderboard,
  getMyLevels,
  getCurrentLevel,
  getGradeReport,
  getGradeReportHistory,   // ✅ NEW: history endpoint
  promoteStudent,
  // ✅ NEW profile functions
  getProfile,
  updateProfile,
  changePassword
} = require('../controllers/studentController');

// Routes accessible by any authenticated student
router.get('/leaderboard', authenticate, getLeaderboard);
router.get('/my-levels', authenticate, getMyLevels);
router.get('/current-level', authenticate, getCurrentLevel);

// ✅ Profile routes (authenticated student)
router.get('/profile', authenticate, getProfile);
router.put('/profile', authenticate, updateProfile);
router.put('/password', authenticate, changePassword);

// ✅ Grade report for a student (student can view their own; admin can view any)
router.get('/:id/grade-report', authenticate, getGradeReport);

// ✅ NEW: Grade report history (grouped by subject grade)
router.get('/:id/grade-history', authenticate, getGradeReportHistory);

// Admin‑only routes
router.get('/', authenticate, isAdmin, getAllStudents);
router.get('/with-quiz-types', authenticate, isAdmin, getStudentsWithQuizTypeCount);
router.put('/:id/approve', authenticate, isAdmin, approveStudent);
router.put('/:id/reject', authenticate, isAdmin, rejectStudent);
router.put('/:id/status', authenticate, isAdmin, updateStudentStatus);
router.delete('/:id', authenticate, isAdmin, deleteStudent);

// ✅ Admin: promote a student
router.post('/admin/promote-student', authenticate, isAdmin, promoteStudent);

module.exports = router;

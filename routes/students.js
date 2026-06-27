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
  getGradeReportHistory,
  promoteStudent,
  getProfile,
  updateProfile,
  changePassword
} = require('../controllers/studentController');

// Routes accessible by any authenticated student
router.get('/leaderboard', authenticate, getLeaderboard);
router.get('/my-levels', authenticate, getMyLevels);
router.get('/current-level', authenticate, getCurrentLevel);

// Profile routes
router.get('/profile', authenticate, getProfile);
router.put('/profile', authenticate, updateProfile);
router.put('/password', authenticate, changePassword);

// Grade report for a student
router.get('/:id/grade-report', authenticate, getGradeReport);
router.get('/:id/grade-history', authenticate, getGradeReportHistory);

// ✅ Admin/Staff routes with permission checks
router.get('/', authenticate, hasPermission('manage_users'), getAllStudents);
router.get('/with-quiz-types', authenticate, hasPermission('manage_users'), getStudentsWithQuizTypeCount);
router.put('/:id/approve', authenticate, hasPermission('manage_users'), approveStudent);
router.put('/:id/reject', authenticate, hasPermission('manage_users'), rejectStudent);
router.put('/:id/status', authenticate, hasPermission('manage_users'), updateStudentStatus);
router.delete('/:id', authenticate, hasPermission('manage_users'), deleteStudent);

// ✅ Promote student – also requires manage_users
router.post('/admin/promote-student', authenticate, hasPermission('manage_users'), promoteStudent);

module.exports = router;

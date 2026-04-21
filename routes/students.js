const express = require('express');
const router = express.Router();
const { authenticate, isAdmin } = require('../middleware/authMiddleware');
const {
  getAllStudents,
  approveStudent,
  rejectStudent,
  updateStudentStatus,
  getStudentsWithQuizTypeCount,
  deleteStudent
} = require('../controllers/studentController');

router.get('/', authenticate, isAdmin, getAllStudents);
router.get('/with-quiz-types', authenticate, isAdmin, getStudentsWithQuizTypeCount);
router.put('/:id/approve', authenticate, isAdmin, approveStudent);
router.put('/:id/reject', authenticate, isAdmin, rejectStudent);
router.put('/:id/status', authenticate, isAdmin, updateStudentStatus);
router.delete('/:id', authenticate, isAdmin, deleteStudent);   // ✅ MUST EXIST

module.exports = router;

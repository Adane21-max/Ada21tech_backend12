// Subject Routes 
// Student Routes 
const express = require('express');
const router = express.Router();
const { authenticate, isAdmin } = require('../middleware/authMiddleware');
const {
  createSubject,
  getSubjects,
  updateSubject,
  deleteSubject
} = require('../controllers/subjectController');

// Public: get subjects (used by students too)
router.get('/', getSubjects);

// Admin only
router.post('/', authenticate, isAdmin, createSubject);
router.put('/:id', authenticate, isAdmin, updateSubject);
router.delete('/:id', authenticate, isAdmin, deleteSubject);

module.exports = router;
const express = require('express');
const router = express.Router();
const { authenticate, isAdmin } = require('../middleware/authMiddleware');
const {
  createLessonNote,
  getLessonNotes,
  getLessonNoteById,
  updateLessonNote,
  deleteLessonNote,
  submitActivity
} = require('../controllers/lessonNoteController');

// Student: get notes (filtered by grade, subject, level)
router.get('/', authenticate, getLessonNotes);

// Student: get single note by ID
router.get('/:id', authenticate, getLessonNoteById);

// Student: submit activity answer
router.post('/:id/submit', authenticate, submitActivity);

// Bulk create lesson notes (admin)
router.post('/bulk', authenticate, isAdmin, lessonNoteController.bulkCreateLessonNotes);

// Admin only
router.post('/', authenticate, isAdmin, createLessonNote);
router.put('/:id', authenticate, isAdmin, updateLessonNote);
router.delete('/:id', authenticate, isAdmin, deleteLessonNote);

module.exports = router;

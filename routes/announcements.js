// Announcement Routes 
const express = require('express');
const router = express.Router();
const { authenticate, isAdmin } = require('../middleware/authMiddleware');
const {
  createAnnouncement,
  getAnnouncements,
  updateAnnouncement,
  deleteAnnouncement
} = require('../controllers/announcementController');

router.get('/', getAnnouncements); // public
router.post('/', authenticate, isAdmin, createAnnouncement);
router.put('/:id', authenticate, isAdmin, updateAnnouncement);
router.delete('/:id', authenticate, isAdmin, deleteAnnouncement);

module.exports = router;
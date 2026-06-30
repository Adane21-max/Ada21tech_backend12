const express = require('express');
const router = express.Router();
const { authenticate, isAdmin } = require('../middleware/authMiddleware'); // ✅ ADD isAdmin
const {
  getActiveCompetition,
  submitCompetition,
  getCompetitionLeaderboard,
  getMonthlyWinners,
  adminGetCompetitions,      // ✅ ADD
  adminCreateCompetition,    // ✅ ADD
  adminUpdateCompetition,    // ✅ ADD
  adminDeleteCompetition     // ✅ ADD
} = require('../controllers/competitionController');

// ─── Student Routes ──────────────────────────────────────────────
router.get('/active', authenticate, getActiveCompetition);
router.post('/submit', authenticate, submitCompetition);
router.get('/:id/leaderboard', authenticate, getCompetitionLeaderboard);
router.get('/monthly-winners', authenticate, getMonthlyWinners);

// ─── Admin Routes ────────────────────────────────────────────────
router.get('/admin', authenticate, isAdmin, adminGetCompetitions);
router.post('/admin', authenticate, isAdmin, adminCreateCompetition);
router.put('/admin/:id', authenticate, isAdmin, adminUpdateCompetition);
router.delete('/admin/:id', authenticate, isAdmin, adminDeleteCompetition);

module.exports = router;

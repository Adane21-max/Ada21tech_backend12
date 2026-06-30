const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const {
  getActiveCompetition,
  submitCompetition,
  getCompetitionLeaderboard,
  getMonthlyWinners
} = require('../controllers/competitionController');

// ─── Student Routes ──────────────────────────────────────────────
router.get('/active', authenticate, getActiveCompetition);
router.post('/submit', authenticate, submitCompetition);
router.get('/:id/leaderboard', authenticate, getCompetitionLeaderboard);
router.get('/monthly-winners', authenticate, getMonthlyWinners);

module.exports = router;

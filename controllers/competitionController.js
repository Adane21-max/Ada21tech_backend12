const db = require('../config/db');

// ─── Helper: Auto‑approve level upgrade for winners ─────────────
async function autoApproveLevelUpgrade(studentId, monthYear) {
  // Check if already approved this month
  const [existing] = await db.query(
    'SELECT id FROM upgrade_requests WHERE student_id = ? AND status = "approved" AND created_at >= ?',
    [studentId, monthYear + '-01']
  );
  if (existing.length > 0) return;

  // Get current level
  const [user] = await db.query('SELECT current_level FROM users WHERE id = ?', [studentId]);
  if (user.length === 0) return;
  const currentLevel = user[0].current_level;

  // Insert auto‑approved upgrade request
  await db.query(
    `INSERT INTO upgrade_requests 
     (student_id, subject_id, from_level, to_level, average_score, status, payer_name, transaction_ref)
     VALUES (?, 0, ?, ?, 0, 'approved', 'COMPETITION_WINNER', 'AUTO_APPROVED')`,
    [studentId, currentLevel, currentLevel + 1]
  );

  // Update user level
  await db.query(
    `UPDATE users SET current_level = ? WHERE id = ?`,
    [currentLevel + 1, studentId]
  );

  console.log(`🏆 Student ${studentId} auto‑approved to Level ${currentLevel + 1} for winning competition!`);
}

// ─── Helper: Check and mark monthly winners ──────────────────────
async function checkMonthlyWinners(competitionId) {
  const [top5] = await db.query(
    `SELECT student_id FROM competition_attempts
     WHERE competition_id = ?
     ORDER BY score DESC, time_taken ASC
     LIMIT 5`,
    [competitionId]
  );

  const monthYear = new Date().toISOString().slice(0, 7);
  for (const winner of top5) {
    await db.query(
      'UPDATE competition_attempts SET is_winner = TRUE WHERE competition_id = ? AND student_id = ?',
      [competitionId, winner.student_id]
    );
    await autoApproveLevelUpgrade(winner.student_id, monthYear);
  }
}

// ─── 1. Student: Get Active Competition ──────────────────────────
exports.getActiveCompetition = async (req, res) => {
  try {
    const studentId = req.user.id;
    const grade = req.user.grade;
    const now = new Date();
    const monthYear = now.toISOString().slice(0, 7);

    const [competitions] = await db.query(
      `SELECT c.*, 
        (SELECT COUNT(*) FROM competition_attempts WHERE competition_id = c.id) as total_participants,
        (SELECT COUNT(*) FROM competition_attempts WHERE competition_id = c.id AND student_id = ?) as has_attempted
       FROM competitions c
       WHERE c.grade = ? AND c.month_year = ? AND c.is_active = TRUE
       AND c.start_time <= ? AND c.end_time >= ?
       LIMIT 1`,
      [studentId, grade, monthYear, now, now]
    );

    if (competitions.length === 0) {
      return res.json({ active: false, message: 'No active competition for your grade.' });
    }

    const comp = competitions[0];
    const totalQuestions = comp.total_questions || 10;

    // Fetch questions for this competition (randomly selected)
    const [questions] = await db.query(
      `SELECT q.* FROM questions q
       JOIN question_types qt ON q.type_id = qt.id
       WHERE qt.grade = ? AND qt.subject_id = ? AND qt.level = ?
       ORDER BY RAND() LIMIT ?`,
      [grade, comp.subject_id, comp.level, totalQuestions]
    );

    res.json({
      active: true,
      competition: comp,
      questions: questions,
      totalQuestions: totalQuestions,
      hasAttempted: comp.has_attempted > 0
    });
  } catch (err) {
    console.error('Get active competition error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── 2. Student: Submit Competition ──────────────────────────────
exports.submitCompetition = async (req, res) => {
  try {
    const studentId = req.user.id;
    const { competition_id, answers, time_taken } = req.body;

    // Check if already attempted
    const [existing] = await db.query(
      'SELECT id FROM competition_attempts WHERE competition_id = ? AND student_id = ?',
      [competition_id, studentId]
    );
    if (existing.length > 0) {
      return res.status(400).json({ message: 'You have already attempted this competition.' });
    }

    let correctCount = 0;
    const totalQuestions = answers.length;
    const answerRecords = [];

    for (const ans of answers) {
      const [question] = await db.query(
        'SELECT correct_answer FROM questions WHERE id = ?',
        [ans.question_id]
      );
      if (question.length === 0) continue;

      const isCorrect = question[0].correct_answer === ans.selected_answer;
      if (isCorrect) correctCount++;
      answerRecords.push({
        question_id: ans.question_id,
        selected_answer: ans.selected_answer,
        is_correct: isCorrect
      });
    }

    const score = Math.round((correctCount / totalQuestions) * 100);

    // Insert attempt
    const [result] = await db.query(
      `INSERT INTO competition_attempts 
       (competition_id, student_id, score, total_questions, correct_count, wrong_count, time_taken)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [competition_id, studentId, score, totalQuestions, correctCount, totalQuestions - correctCount, time_taken]
    );

    const attemptId = result.insertId;

    // Insert detailed answers
    for (const rec of answerRecords) {
      await db.query(
        `INSERT INTO competition_answers 
         (attempt_id, question_id, selected_answer, is_correct)
         VALUES (?, ?, ?, ?)`,
        [attemptId, rec.question_id, rec.selected_answer, rec.is_correct]
      );
    }

    // Check winners (top 5) – runs asynchronously, doesn't block response
    checkMonthlyWinners(competition_id).catch(err => console.error('Winner check error:', err));

    res.json({
      message: 'Competition submitted successfully!',
      score,
      correct: correctCount,
      total: totalQuestions,
      attemptId
    });
  } catch (err) {
    console.error('Submit competition error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── 3. Student: Get Competition Leaderboard ──────────────────────
exports.getCompetitionLeaderboard = async (req, res) => {
  try {
    const { id } = req.params;
    const studentId = req.user.id;

    const [rows] = await db.query(
      `SELECT ca.*, u.username, u.first_name, u.last_name
       FROM competition_attempts ca
       JOIN users u ON ca.student_id = u.id
       WHERE ca.competition_id = ?
       ORDER BY ca.score DESC, ca.time_taken ASC
       LIMIT 20`,
      [id]
    );

    // Find current user's rank
    const [rank] = await db.query(
      `SELECT COUNT(*) + 1 as rank
       FROM competition_attempts
       WHERE competition_id = ? AND score > (SELECT score FROM competition_attempts WHERE competition_id = ? AND student_id = ?)`,
      [id, id, studentId]
    );

    res.json({
      leaderboard: rows,
      myRank: rank[0]?.rank || 'N/A',
      totalParticipants: rows.length
    });
  } catch (err) {
    console.error('Get leaderboard error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── 4. Student: Get Monthly Winners ──────────────────────────────
exports.getMonthlyWinners = async (req, res) => {
  try {
    const monthYear = new Date().toISOString().slice(0, 7);
    const studentId = req.user.id;

    const [winners] = await db.query(
      `SELECT ca.*, u.username, u.first_name, u.last_name, c.title as competition_title
       FROM competition_attempts ca
       JOIN users u ON ca.student_id = u.id
       JOIN competitions c ON ca.competition_id = c.id
       WHERE c.month_year = ? AND ca.is_winner = TRUE
       ORDER BY ca.score DESC
       LIMIT 5`,
      [monthYear]
    );

    const [myBest] = await db.query(
      `SELECT ca.*, u.username
       FROM competition_attempts ca
       JOIN users u ON ca.student_id = u.id
       JOIN competitions c ON ca.competition_id = c.id
       WHERE c.month_year = ? AND ca.student_id = ?
       ORDER BY ca.score DESC
       LIMIT 1`,
      [monthYear, studentId]
    );

    res.json({
      winners,
      myBest: myBest[0] || null,
      monthYear
    });
  } catch (err) {
    console.error('Get monthly winners error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── 5. Admin: Get All Competitions ──────────────────────────────
exports.adminGetCompetitions = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT c.*, s.name as subject_name,
        (SELECT COUNT(*) FROM competition_attempts WHERE competition_id = c.id) as total_participants
       FROM competitions c
       LEFT JOIN subjects s ON c.subject_id = s.id
       ORDER BY c.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('Admin get competitions error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── 6. Admin: Create Competition ────────────────────────────────
exports.adminCreateCompetition = async (req, res) => {
  try {
    const { title, description, grade, subject_id, level, start_time, end_time, total_questions, is_active, month_year } = req.body;

    if (!title || !grade || !subject_id || !start_time || !end_time) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const [result] = await db.query(
      `INSERT INTO competitions 
       (title, description, grade, subject_id, level, start_time, end_time, total_questions, is_active, month_year)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, description || '', grade, subject_id, level || 1, start_time, end_time, total_questions || 10, is_active !== undefined ? is_active : true, month_year || new Date().toISOString().slice(0, 7)]
    );

    res.status(201).json({ id: result.insertId, message: 'Competition created' });
  } catch (err) {
    console.error('Admin create competition error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── 7. Admin: Update Competition ────────────────────────────────
exports.adminUpdateCompetition = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, grade, subject_id, level, start_time, end_time, total_questions, is_active, month_year } = req.body;

    const [result] = await db.query(
      `UPDATE competitions SET
       title = ?, description = ?, grade = ?, subject_id = ?, level = ?,
       start_time = ?, end_time = ?, total_questions = ?, is_active = ?, month_year = ?
       WHERE id = ?`,
      [title, description || '', grade, subject_id, level || 1, start_time, end_time, total_questions || 10, is_active !== undefined ? is_active : true, month_year || new Date().toISOString().slice(0, 7), id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Competition not found' });
    }

    res.json({ message: 'Competition updated' });
  } catch (err) {
    console.error('Admin update competition error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── 8. Admin: Delete Competition ────────────────────────────────
exports.adminDeleteCompetition = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await db.query('DELETE FROM competitions WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Competition not found' });
    }

    res.json({ message: 'Competition deleted' });
  } catch (err) {
    console.error('Admin delete competition error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

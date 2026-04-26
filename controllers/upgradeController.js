const db = require('../config/db');
const UPGRADE_THRESHOLD = 70; // required average percentage

// Student requests a global level upgrade (no subject_id)
exports.requestUpgrade = async (req, res) => {
  try {
    const studentId = req.user.id;
    const studentGrade = req.user.grade;

    // 1. Get student's current global level
    const [userRows] = await db.query('SELECT current_level FROM users WHERE id = ?', [studentId]);
    if (userRows.length === 0) {
      return res.status(400).json({ message: 'User not found.' });
    }
    const currentLevel = userRows[0].current_level;

    // 2. Find all quizzes at the current level for the student's grade
    const [requiredQuizzes] = await db.query(
      `SELECT id FROM question_types
       WHERE grade = ? AND level = ? AND is_visible = TRUE`,
      [studentGrade, currentLevel]
    );
    const requiredIds = requiredQuizzes.map(q => q.id);
    if (requiredIds.length === 0) {
      return res.status(400).json({ message: 'No quizzes found for your current level.' });
    }

    // 3. Check that the student attempted all of them
    const [attempts] = await db.query(
      'SELECT type_id, score, total_questions FROM quiz_attempts WHERE student_id = ? AND type_id IN (?)',
      [studentId, requiredIds]
    );
    const attemptedIds = attempts.map(a => a.type_id);
    const missing = requiredIds.filter(id => !attemptedIds.includes(id));
    if (missing.length > 0) {
      return res.status(400).json({
        message: `You must complete all Level ${currentLevel} quizzes before requesting an upgrade.`
      });
    }

    // 4. Calculate overall average
    let totalPercent = 0;
    attempts.forEach(a => {
      totalPercent += (a.score / a.total_questions) * 100;
    });
    const average = totalPercent / attempts.length;

    if (average < UPGRADE_THRESHOLD) {
      return res.status(400).json({
        message: `Your overall average is ${average.toFixed(1)}%. You need at least ${UPGRADE_THRESHOLD}% to request an upgrade.`
      });
    }

    // 5. Check for existing pending global request
    const [existing] = await db.query(
      "SELECT id FROM upgrade_requests WHERE student_id = ? AND subject_id IS NULL AND status = 'pending'",
      [studentId]
    );
    if (existing.length > 0) {
      return res.status(400).json({ message: 'You already have a pending upgrade request.' });
    }

    // 6. Create global upgrade request (subject_id = NULL)
    const nextLevel = currentLevel + 1;
    await db.query(
      `INSERT INTO upgrade_requests (student_id, subject_id, from_level, to_level, average_score)
       VALUES (?, NULL, ?, ?, ?)`,
      [studentId, currentLevel, nextLevel, average]
    );

    res.json({ message: `Upgrade request to Level ${nextLevel} submitted. Awaiting admin approval.` });
  } catch (error) {
    console.error('Request upgrade error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Admin: get all upgrade requests
exports.getUpgradeRequests = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT ur.*, u.username,
        CASE WHEN ur.subject_id IS NULL THEN 'All subjects' ELSE s.name END AS subject_name
       FROM upgrade_requests ur
       JOIN users u ON ur.student_id = u.id
       LEFT JOIN subjects s ON ur.subject_id = s.id
       ORDER BY ur.created_at DESC`
    );
    res.json(rows);
  } catch (error) {
    console.error('Get upgrade requests error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Admin: approve a global upgrade request
exports.approveUpgrade = async (req, res) => {
  try {
    const { id } = req.params;
    const [request] = await db.query('SELECT * FROM upgrade_requests WHERE id = ?', [id]);
    if (request.length === 0) {
      return res.status(404).json({ message: 'Request not found.' });
    }
    const { student_id, to_level } = request[0];

    // 1. Update the student's global current_level
    await db.query('UPDATE users SET current_level = ? WHERE id = ?', [to_level, student_id]);

    // 2. Sync all student_subject_level rows to the new level
    await db.query(
      'UPDATE student_subject_level SET level = ? WHERE student_id = ?',
      [to_level, student_id]
    );

    // 3. Mark request as approved
    await db.query("UPDATE upgrade_requests SET status = 'approved' WHERE id = ?", [id]);

    res.json({ message: `Upgrade approved. Student moved to Level ${to_level}.` });
  } catch (error) {
    console.error('Approve upgrade error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Admin: reject an upgrade request
exports.rejectUpgrade = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query("UPDATE upgrade_requests SET status = 'rejected' WHERE id = ?", [id]);
    res.json({ message: 'Upgrade rejected.' });
  } catch (error) {
    console.error('Reject upgrade error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Student: check if a global pending upgrade request exists
exports.getMyPendingRequests = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id FROM upgrade_requests WHERE student_id = ? AND subject_id IS NULL AND status = 'pending'",
      [req.user.id]
    );
    res.json({ pending: rows.length > 0 });
  } catch (error) {
    console.error('Get my pending requests error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

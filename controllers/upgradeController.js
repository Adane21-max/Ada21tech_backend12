const db = require('../config/db');
const UPGRADE_THRESHOLD = 70; // required average percentage

// Student requests an upgrade to the next level
exports.requestUpgrade = async (req, res) => {
  try {
    const studentId = req.user.id;
    const { subject_id } = req.body;

    if (!subject_id) {
      return res.status(400).json({ message: 'Subject ID is required.' });
    }

    // 1. Get student's current unlocked level for this subject
    const [levelRows] = await db.query(
      'SELECT level FROM student_subject_level WHERE student_id = ? AND subject_id = ?',
      [studentId, subject_id]
    );
    if (levelRows.length === 0) {
      return res.status(400).json({ message: 'You are not enrolled in this subject.' });
    }
    const currentLevel = levelRows[0].level;

    // 2. Find all required quizzes for the current level
    const [requiredQuizzes] = await db.query(
      `SELECT id FROM question_types 
       WHERE subject_id = ? AND grade = ? AND level = ? AND is_visible = TRUE`,
      [subject_id, req.user.grade, currentLevel]
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
      return res.status(400).json({ message: 'You must complete all quizzes in the current level before requesting an upgrade.' });
    }

    // 4. Calculate average percentage
    let totalPercent = 0;
    attempts.forEach(a => {
      totalPercent += (a.score / a.total_questions) * 100;
    });
    const average = totalPercent / attempts.length;

    if (average < UPGRADE_THRESHOLD) {
      return res.status(400).json({
        message: `Your average score is ${average.toFixed(1)}%. You need at least ${UPGRADE_THRESHOLD}% to request an upgrade.`
      });
    }

    // 5. Check for existing pending request
    const [existing] = await db.query(
      "SELECT id FROM upgrade_requests WHERE student_id = ? AND subject_id = ? AND status = 'pending'",
      [studentId, subject_id]
    );
    if (existing.length > 0) {
      return res.status(400).json({ message: 'You already have a pending upgrade request for this subject.' });
    }

    // 6. Create the upgrade request
    const nextLevel = currentLevel + 1;
    await db.query(
      `INSERT INTO upgrade_requests (student_id, subject_id, from_level, to_level, average_score)
       VALUES (?, ?, ?, ?, ?)`,
      [studentId, subject_id, currentLevel, nextLevel, average]
    );

    res.json({ message: `Upgrade request to Level ${nextLevel} submitted. Waiting for admin approval.` });
  } catch (error) {
    console.error('Request upgrade error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Admin: get all upgrade requests
exports.getUpgradeRequests = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT ur.*, u.username, s.name AS subject_name
       FROM upgrade_requests ur
       JOIN users u ON ur.student_id = u.id
       JOIN subjects s ON ur.subject_id = s.id
       ORDER BY ur.created_at DESC`
    );
    res.json(rows);
  } catch (error) {
    console.error('Get upgrade requests error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Admin: approve an upgrade request
exports.approveUpgrade = async (req, res) => {
  try {
    const { id } = req.params;
    const [request] = await db.query('SELECT * FROM upgrade_requests WHERE id = ?', [id]);
    if (request.length === 0) {
      return res.status(404).json({ message: 'Request not found.' });
    }
    const { student_id, subject_id, to_level } = request[0];

    // Update the student's unlocked level
    await db.query(
      'UPDATE student_subject_level SET level = ? WHERE student_id = ? AND subject_id = ?',
      [to_level, student_id, subject_id]
    );

    // Mark request as approved
    await db.query("UPDATE upgrade_requests SET status = 'approved' WHERE id = ?", [id]);

    res.json({ message: 'Upgrade approved.' });
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

// Student: get subject IDs of pending upgrade requests
exports.getMyPendingRequests = async (req, res) => {
  try {
    const studentId = req.user.id;
    const [rows] = await db.query(
      "SELECT subject_id FROM upgrade_requests WHERE student_id = ? AND status = 'pending'",
      [studentId]
    );
    res.json(rows.map(r => r.subject_id));
  } catch (error) {
    console.error('Get my pending requests error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

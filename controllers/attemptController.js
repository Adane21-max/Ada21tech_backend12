const db = require('../config/db');

// Save a quiz attempt (with duplicate check)
exports.saveAttempt = async (req, res) => {
  try {
    const { type_id, score, total_questions, time_taken } = req.body;
    const student_id = req.user.id;

    // Check if an attempt already exists for this student and quiz type
    const [existing] = await db.query(
      'SELECT id FROM quiz_attempts WHERE student_id = ? AND type_id = ? LIMIT 1',
      [student_id, type_id]
    );

    if (existing.length > 0) {
      return res.status(400).json({ message: 'You have already taken this quiz.' });
    }

    // Save the new attempt
    const [result] = await db.query(
      'INSERT INTO quiz_attempts (student_id, type_id, score, total_questions, time_taken) VALUES (?, ?, ?, ?, ?)',
      [student_id, type_id, score, total_questions, time_taken]
    );

    res.status(201).json({ message: 'Attempt saved', attemptId: result.insertId });
  } catch (error) {
    console.error('SAVE ATTEMPT ERROR:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all attempts for the logged-in student (summary) – MUST INCLUDE type_id
exports.getStudentAttempts = async (req, res) => {
  try {
    const studentId = req.user.id;
    const [rows] = await db.query(
      `SELECT qa.id, qa.type_id, qa.score, qa.total_questions, qa.time_taken, qa.created_at,
              qt.name AS quiz_name, s.name AS subject_name, qt.grade
       FROM quiz_attempts qa
       JOIN question_types qt ON qa.type_id = qt.id
       JOIN subjects s ON qt.subject_id = s.id
       WHERE qa.student_id = ?
       ORDER BY qa.created_at DESC`,
      [studentId]
    );
    res.json(rows);
  } catch (error) {
    console.error('GET STUDENT ATTEMPTS ERROR:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get detailed attempt with questions for review
exports.getAttemptDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const studentId = req.user.id;

    // Fetch attempt info
    const [attemptRows] = await db.query(
      `SELECT qa.*, qt.name AS quiz_name, qt.total_time
       FROM quiz_attempts qa
       JOIN question_types qt ON qa.type_id = qt.id
       WHERE qa.id = ? AND qa.student_id = ?`,
      [id, studentId]
    );
    if (attemptRows.length === 0) {
      return res.status(404).json({ message: 'Attempt not found' });
    }
    const attempt = attemptRows[0];

    // Fetch questions for that quiz type (to display review)
    const [questionRows] = await db.query(
      `SELECT * FROM questions WHERE type_id = ?`,
      [attempt.type_id]
    );

    res.json({
      attempt,
      questions: questionRows
    });
  } catch (error) {
    console.error('GET ATTEMPT DETAILS ERROR:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
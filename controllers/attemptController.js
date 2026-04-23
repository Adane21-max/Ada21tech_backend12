const db = require('../config/db');

// Save a quiz attempt (with duplicate check) – now stores student answers
exports.saveAttempt = async (req, res) => {
  try {
    const { type_id, score, total_questions, time_taken, answers } = req.body;
    const student_id = req.user.id;

    // Check if an attempt already exists for this student and quiz type
    const [existing] = await db.query(
      'SELECT id FROM quiz_attempts WHERE student_id = ? AND type_id = ? LIMIT 1',
      [student_id, type_id]
    );

    if (existing.length > 0) {
      return res.status(400).json({ message: 'You have already taken this quiz.' });
    }

    // Convert answers object to JSON string (or null if not provided)
    const answersJson = answers ? JSON.stringify(answers) : null;

    // Save the new attempt including answers
    const [result] = await db.query(
      'INSERT INTO quiz_attempts (student_id, type_id, score, total_questions, time_taken, answers) VALUES (?, ?, ?, ?, ?, ?)',
      [student_id, type_id, score, total_questions, time_taken, answersJson]
    );

    res.status(201).json({ message: 'Attempt saved', attemptId: result.insertId });
  } catch (error) {
    console.error('SAVE ATTEMPT ERROR:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all attempts for the logged-in student (summary)
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

// Get detailed attempt with questions and student answers for review
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

    // Parse stored answers JSON
    let studentAnswers = {};
    if (attempt.answers) {
      try {
        studentAnswers = typeof attempt.answers === 'string'
          ? JSON.parse(attempt.answers)
          : attempt.answers;
      } catch (e) {
        console.error('Error parsing answers JSON:', e);
      }
    }

    // Fetch questions for that quiz type
    const [questionRows] = await db.query(
      `SELECT * FROM questions WHERE type_id = ?`,
      [attempt.type_id]
    );

    // Attach student answer to each question
    const questionsWithAnswers = questionRows.map(q => ({
      ...q,
      student_answer: studentAnswers[q.id] || null
    }));

    res.json({
      attempt,
      questions: questionsWithAnswers
    });
  } catch (error) {
    console.error('GET ATTEMPT DETAILS ERROR:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

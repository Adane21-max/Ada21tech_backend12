const db = require('../config/db');

// Helper: safely parse activity (if string -> parse, else keep as is)
function parseActivity(activity) {
  if (!activity) return null;
  if (typeof activity === 'string') {
    try {
      return JSON.parse(activity);
    } catch (e) {
      console.error('Failed to parse activity:', activity);
      return null;
    }
  }
  return activity;
}

// CREATE lesson note (admin)
exports.createLessonNote = async (req, res) => {
  try {
    const { title, content, grade, subject_id, level, activity } = req.body;

    // ✅ Only require title, grade, subject_id – content is optional
    if (!title || !grade || !subject_id) {
      return res.status(400).json({ 
        message: 'Missing required fields: title, grade, and subject_id are required' 
      });
    }

    // ✅ Allow content to be empty string
    const noteContent = content || '';

    let activityJson = null;
    if (activity && typeof activity === 'object') {
      activityJson = JSON.stringify(activity);
    }

    const [result] = await db.query(
      `INSERT INTO lesson_notes (title, content, grade, subject_id, level, activity)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [title, noteContent, grade, subject_id, level || 1, activityJson]
    );

    res.status(201).json({ message: 'Lesson note created', id: result.insertId });
  } catch (error) {
    console.error('CREATE LESSON NOTE ERROR:', error);
    res.status(500).json({ message: error.message, sql: error.sql });
  }
};

// GET notes for student (filter by grade, subject_id, level)
exports.getLessonNotes = async (req, res) => {
  try {
    const { grade, subject_id, level } = req.query;
    let query = `SELECT * FROM lesson_notes WHERE 1=1`;
    const params = [];
    if (grade) {
      query += ` AND grade = ?`;
      params.push(grade);
    }
    if (subject_id) {
      query += ` AND subject_id = ?`;
      params.push(subject_id);
    }
    if (level) {
      query += ` AND level = ?`;
      params.push(level);
    }
    const [rows] = await db.query(query, params);
    rows.forEach(row => {
      if (row.activity) row.activity = typeof row.activity === 'string' ? JSON.parse(row.activity) : row.activity;
    });
    res.json(rows);
  } catch (error) {
    console.error('GET LESSON NOTES ERROR:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET single note by ID
exports.getLessonNoteById = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query(`SELECT * FROM lesson_notes WHERE id = ?`, [id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Not found' });
    rows[0].activity = parseActivity(rows[0].activity);
    res.json(rows[0]);
  } catch (error) {
    console.error('GET NOTE BY ID ERROR:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// UPDATE lesson note (admin)
exports.updateLessonNote = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, grade, subject_id, level, activity } = req.body;

    let activityJson = null;
    if (activity && typeof activity === 'object') {
      activityJson = JSON.stringify(activity);
    }

    const [result] = await db.query(
      `UPDATE lesson_notes SET title=?, content=?, grade=?, subject_id=?, level=?, activity=?
       WHERE id = ?`,
      [title, content, grade, subject_id, level || 1, activityJson, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Lesson note not found' });
    }
    res.json({ message: 'Lesson note updated' });
  } catch (error) {
    console.error('UPDATE LESSON NOTE ERROR:', error);
    res.status(500).json({ message: error.message });
  }
};

// DELETE lesson note (admin)
exports.deleteLessonNote = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query(`DELETE FROM lesson_notes WHERE id = ?`, [id]);
    res.json({ message: 'Lesson note deleted' });
  } catch (error) {
    console.error('DELETE LESSON NOTE ERROR:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Submit activity (student)
exports.submitActivity = async (req, res) => {
  try {
    const { id } = req.params;
    const { score, answers } = req.body;
    const student_id = req.user.id;
    await db.query(
      `INSERT INTO lesson_attempts (student_id, note_id, score, answers)
       VALUES (?, ?, ?, ?)`,
      [student_id, id, score || null, answers ? JSON.stringify(answers) : null]
    );
    res.json({ message: 'Activity submitted' });
  } catch (error) {
    console.error('SUBMIT ACTIVITY ERROR:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

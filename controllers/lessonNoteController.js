const db = require('../config/db');

// CREATE lesson note (admin)
exports.createLessonNote = async (req, res) => {
  try {
    const { title, content, grade, subject_id, level, activity } = req.body;
    const [result] = await db.query(
      `INSERT INTO lesson_notes (title, content, grade, subject_id, level, activity)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [title, content, grade, subject_id, level || 1, activity ? JSON.stringify(activity) : null]
    );
    res.status(201).json({ message: 'Lesson note created', id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
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
      if (row.activity) row.activity = JSON.parse(row.activity);
    });
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET single note by ID
exports.getLessonNoteById = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query(`SELECT * FROM lesson_notes WHERE id = ?`, [id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Not found' });
    if (rows[0].activity) rows[0].activity = JSON.parse(rows[0].activity);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// UPDATE lesson note (admin)
exports.updateLessonNote = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, grade, subject_id, level, activity } = req.body;
    await db.query(
      `UPDATE lesson_notes SET title=?, content=?, grade=?, subject_id=?, level=?, activity=?
       WHERE id = ?`,
      [title, content, grade, subject_id, level || 1, activity ? JSON.stringify(activity) : null, id]
    );
    res.json({ message: 'Lesson note updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// DELETE lesson note (admin)
exports.deleteLessonNote = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query(`DELETE FROM lesson_notes WHERE id = ?`, [id]);
    res.json({ message: 'Lesson note deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Submit activity (student) - save to lesson_attempts
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
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

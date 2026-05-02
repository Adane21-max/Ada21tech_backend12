const db = require('../config/db');

// Admin: Create a question type
exports.createQuestionType = async (req, res) => {
  try {
    const { name, grade, subject_id, total_time, is_visible, level, start_date, end_date } = req.body;
    if (!name || !grade || !subject_id) {
      return res.status(400).json({ message: 'Name, grade, and subject are required' });
    }
    const [result] = await db.query(
      'INSERT INTO question_types (name, grade, subject_id, total_time, is_visible, level, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [name, grade, subject_id, total_time || null, is_visible !== false, level || 1, start_date || null, end_date || null]
    );
    res.status(201).json({ message: 'Question type created', id: result.insertId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Admin: Get all question types (with optional filters)
exports.getQuestionTypes = async (req, res) => {
  try {
    const { grade, subject_id } = req.query;
    let query = 'SELECT qt.*, s.name AS subject_name FROM question_types qt JOIN subjects s ON qt.subject_id = s.id WHERE 1=1';
    const params = [];
    if (grade) { query += ' AND qt.grade = ?'; params.push(grade); }
    if (subject_id) { query += ' AND qt.subject_id = ?'; params.push(subject_id); }
    query += ' ORDER BY qt.created_at DESC';
    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Admin: Update question type (supports partial updates)
exports.updateQuestionType = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    console.log('--- UPDATE QUESTION TYPE ---');
    console.log('ID:', id);
    console.log('Raw body:', req.body);

    // Convert empty total_time to null
    if (updates.total_time === '') {
      updates.total_time = null;
    } else if (updates.total_time) {
      updates.total_time = parseInt(updates.total_time);
    }

    const fields = [];
    const values = [];
    const allowedFields = ['name', 'grade', 'subject_id', 'total_time', 'is_visible', 'level', 'start_date', 'end_date'];

    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(updates[field]);
      }
    });

    if (fields.length === 0) {
      return res.status(400).json({ message: 'No valid fields to update' });
    }

    values.push(id);
    const sql = `UPDATE question_types SET ${fields.join(', ')} WHERE id = ?`;
    console.log('SQL:', sql);
    console.log('Values:', values);

    const [result] = await db.query(sql, values);
    console.log('Update result:', result);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Question type not found' });
    }

    res.json({ message: 'Question type updated' });
  } catch (error) {
    console.error('UPDATE QUESTION TYPE ERROR:', error);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

// Admin: Delete question type
exports.deleteQuestionType = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM question_types WHERE id = ?', [id]);
    res.json({ message: 'Question type deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Student: Get visible question types that are currently active and within level
exports.getVisibleTypesForStudent = async (req, res) => {
  try {
    const studentId = req.user.id;
    const { grade, subject_id } = req.query;
    if (!grade) {
      return res.status(400).json({ message: 'Grade is required' });
    }

    // Get the student's unlocked level for each subject
    const [levels] = await db.query(
      'SELECT subject_id, level FROM student_subject_level WHERE student_id = ?',
      [studentId]
    );
    const levelMap = {};
    levels.forEach(l => { levelMap[l.subject_id] = l.level; });

    // Fetch visible and currently available quizzes based on date
            let query = `
      SELECT id, name, total_time, subject_id, level, start_date, end_date
      FROM question_types
      WHERE grade = ? AND is_visible = TRUE
        AND (end_date IS NULL OR end_date >= NOW())
    `;
    const params = [grade];
    if (subject_id) {
      query += ' AND subject_id = ?';
      params.push(subject_id);
    }

    const [rows] = await db.query(query, params);

    // Filter out quizzes that are above the student's current level
    const filtered = rows.filter(q => {
      const studentLevel = levelMap[q.subject_id] || 1;
      return q.level <= studentLevel;
    });

    res.json(filtered);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get single question type by ID – also checks schedule
exports.getQuestionTypeById = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query(
      'SELECT qt.*, s.name AS subject_name FROM question_types qt JOIN subjects s ON qt.subject_id = s.id WHERE qt.id = ?',
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Question type not found' });
    }

    const qt = rows[0];
    const now = new Date();
    const start = qt.start_date ? new Date(qt.start_date) : null;
    const end = qt.end_date ? new Date(qt.end_date) : null;

    // If start date is set and it's in the future, block access
    if (start && now < start) {
      return res.status(403).json({ message: 'This quiz is not yet available. Please wait until the scheduled start time.' });
    }

    // If end date is set and it's in the past, block access
    if (end && now > end) {
      return res.status(403).json({ message: 'This quiz has expired and is no longer available.' });
    }

    res.json(qt);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getScheduledQuizzesForStudent = async (req, res) => {
  try {
    const { grade } = req.query;
    if (!grade) {
      return res.status(400).json({ message: 'Grade is required' });
    }
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const [rows] = await db.query(
      `SELECT qt.*, s.name AS subject_name 
       FROM question_types qt 
       JOIN subjects s ON qt.subject_id = s.id 
       WHERE qt.grade = ? AND qt.is_visible = TRUE 
         AND (qt.start_date IS NOT NULL OR qt.end_date IS NOT NULL)
       ORDER BY qt.start_date ASC`,
      [grade]
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

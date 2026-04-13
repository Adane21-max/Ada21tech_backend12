// Subject Controller 
const db = require('../config/db');

// Admin: Create subject
exports.createSubject = async (req, res) => {
  try {
    const { grade, level, name } = req.body;
    if (!grade || !name) {
      return res.status(400).json({ message: 'Grade and name are required' });
    }
    const [result] = await db.query(
      'INSERT INTO subjects (grade, level, name) VALUES (?, ?, ?)',
      [grade, level || null, name]
    );
    res.status(201).json({ message: 'Subject created', id: result.insertId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all subjects (admin) or filter by grade (student)
exports.getSubjects = async (req, res) => {
  try {
    const { grade } = req.query;
    let query = 'SELECT * FROM subjects';
    const params = [];
    if (grade) {
      query += ' WHERE grade = ?';
      params.push(grade);
    }
    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update subject
exports.updateSubject = async (req, res) => {
  try {
    const { id } = req.params;
    const { grade, level, name } = req.body;
    await db.query(
      'UPDATE subjects SET grade = ?, level = ?, name = ? WHERE id = ?',
      [grade, level, name, id]
    );
    res.json({ message: 'Subject updated' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete subject
exports.deleteSubject = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM subjects WHERE id = ?', [id]);
    res.json({ message: 'Subject deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};
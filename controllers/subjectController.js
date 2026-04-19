const db = require('../config/db');

// Get all subjects
exports.getSubjects = async (req, res) => {
  try {
    const { grade } = req.query;
    let query = 'SELECT id, grade, name, created_at FROM subjects';
    const params = [];
    if (grade) {
      query += ' WHERE grade = ?';
      params.push(grade);
    }
    query += ' ORDER BY grade ASC';
    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('❌ getSubjects error:', error.message);
    console.error('   Code:', error.code);
    console.error('   SQL:', error.sql);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create a subject (only grade and name)
exports.createSubject = async (req, res) => {
  try {
    const { grade, name } = req.body;
    if (!grade || !name) {
      return res.status(400).json({ message: 'Grade and name are required' });
    }
    const [result] = await db.query(
      'INSERT INTO subjects (grade, name) VALUES (?, ?)',
      [grade, name]
    );
    res.status(201).json({ message: 'Subject created', id: result.insertId });
  } catch (error) {
    console.error('❌ createSubject error:', error.message);
    console.error('   Code:', error.code);
    console.error('   SQL:', error.sql);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update a subject
exports.updateSubject = async (req, res) => {
  try {
    const { id } = req.params;
    const { grade, name } = req.body;
    await db.query('UPDATE subjects SET grade = ?, name = ? WHERE id = ?', [grade, name, id]);
    res.json({ message: 'Subject updated' });
  } catch (error) {
    console.error('❌ updateSubject error:', error.message);
    console.error('   Code:', error.code);
    console.error('   SQL:', error.sql);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete a subject
exports.deleteSubject = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM subjects WHERE id = ?', [id]);
    res.json({ message: 'Subject deleted' });
  } catch (error) {
    console.error('❌ deleteSubject error:', error.message);
    console.error('   Code:', error.code);
    console.error('   SQL:', error.sql);
    res.status(500).json({ message: 'Server error' });
  }
};
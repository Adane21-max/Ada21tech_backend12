const db = require('../config/db');

exports.getAllStudents = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id, username, grade, status, created_at FROM users WHERE role = 'student' ORDER BY created_at DESC"
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.approveStudent = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query("UPDATE users SET status = 'approved' WHERE id = ? AND role = 'student'", [id]);
    res.json({ message: 'Student approved' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.rejectStudent = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query("UPDATE users SET status = 'rejected' WHERE id = ? AND role = 'student'", [id]);
    res.json({ message: 'Student rejected' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.updateStudentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    await db.query("UPDATE users SET status = ? WHERE id = ? AND role = 'student'", [status, id]);
    res.json({ message: 'Student status updated' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// NEW: Get students with count of distinct question types attempted
exports.getStudentsWithQuizTypeCount = async (req, res) => {
  try {
    const { grade } = req.query;
    let query = `
      SELECT u.id, u.username, u.grade, u.status, u.created_at,
             COUNT(DISTINCT qa.type_id) AS quiz_types_taken
      FROM users u
      LEFT JOIN quiz_attempts qa ON u.id = qa.student_id
      WHERE u.role = 'student'
    `;
    const params = [];
    if (grade) {
      query += ' AND u.grade = ?';
      params.push(grade);
    }
    query += ' GROUP BY u.id ORDER BY u.created_at DESC';
    
    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};
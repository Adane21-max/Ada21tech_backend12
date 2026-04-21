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

// ✅ NEW: Delete student with cascade
exports.deleteStudent = async (req, res) => {
  const { id } = req.params;
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // Temporarily disable foreign key checks to safely delete the user
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    
    // Delete child records to keep the database clean
    await connection.query('DELETE FROM payments WHERE student_id = ?', [id]);
    await connection.query('DELETE FROM quiz_attempts WHERE student_id = ?', [id]);
    
    // Delete the user
    const [result] = await connection.query(
      "DELETE FROM users WHERE id = ? AND role = 'student'",
      [id]
    );
    
    // Re-enable foreign key checks
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    
    await connection.commit();
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Student not found' });
    }
    
    res.json({ message: 'Student and all associated data deleted' });
  } catch (error) {
    await connection.rollback();
    console.error('Delete student error:', error);
    res.status(500).json({ message: 'Server error', detail: error.message });
  } finally {
    connection.release();
  }
};

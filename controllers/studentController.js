const db = require('../config/db');

// Get all students (basic info)
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

// Approve a student
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

// Reject a student
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

// Update student status
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

// Get students with detailed stats (quiz types taken, T (sum), overall average)
exports.getStudentsWithQuizTypeCount = async (req, res) => {
  try {
    const { grade } = req.query;
    
    let query = `
      SELECT 
        u.id, u.username, u.grade, u.status, u.created_at,
        COALESCE(stats.quiz_types_taken, 0) AS quiz_types_taken,
        COALESCE(stats.total_subject_avg_sum, 0) AS total_subject_avg_sum,
        COALESCE(stats.overall_avg, 0) AS overall_avg
      FROM users u
      LEFT JOIN (
        SELECT 
          student_id,
          COUNT(DISTINCT type_id) AS quiz_types_taken,
          SUM(subject_avg) AS total_subject_avg_sum,
          AVG(subject_avg) AS overall_avg
        FROM (
          SELECT 
            qa.student_id,
            qt.subject_id,
            AVG(qa.score / qa.total_questions * 100) AS subject_avg
          FROM quiz_attempts qa
          JOIN question_types qt ON qa.type_id = qt.id
          GROUP BY qa.student_id, qt.subject_id
        ) AS subject_averages
        GROUP BY student_id
      ) AS stats ON u.id = stats.student_id
      WHERE u.role = 'student'
    `;
    
    const params = [];
    if (grade) {
      query += ' AND u.grade = ?';
      params.push(grade);
    }
    query += ' ORDER BY u.created_at DESC';
    
    const [rows] = await db.query(query, params);
    
    // Round values to 2 decimal places
    rows.forEach(row => {
      row.total_subject_avg_sum = Math.round(row.total_subject_avg_sum * 100) / 100;
      row.overall_avg = Math.round(row.overall_avg * 100) / 100;
    });
    
    res.json(rows);
  } catch (error) {
    console.error('Error in getStudentsWithQuizTypeCount:', error);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

// Delete a student and all related records (cascade)
exports.deleteStudent = async (req, res) => {
  const { id } = req.params;
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // Temporarily disable foreign key checks
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    
    // Delete child records
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

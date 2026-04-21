const db = require('../config/db');

// Get all students (basic info only)
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

// Reject a student (set to rejected/suspended)
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

// Update student status (pending/approved/rejected)
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

// Get students with detailed stats: quiz types taken, T (sum), overall average
exports.getStudentsWithQuizTypeCount = async (req, res) => {
  try {
    const { grade } = req.query;
    
    // First, get basic student info
    let studentQuery = `
      SELECT id, username, grade, status, created_at
      FROM users
      WHERE role = 'student'
    `;
    const params = [];
    if (grade) {
      studentQuery += ' AND grade = ?';
      params.push(grade);
    }
    studentQuery += ' ORDER BY created_at DESC';
    
    const [students] = await db.query(studentQuery, params);
    
    // For each student, get their stats individually (safe, avoids complex joins)
    for (const student of students) {
      // 1. Count distinct quiz types attempted
      const [typeCount] = await db.query(
        `SELECT COUNT(DISTINCT type_id) AS count FROM quiz_attempts WHERE student_id = ?`,
        [student.id]
      );
      student.quiz_types_taken = typeCount[0].count || 0;
      
      // 2. Get average per subject
      const [subjectAvgs] = await db.query(
        `SELECT 
           qt.subject_id,
           AVG(qa.score / NULLIF(qa.total_questions, 0) * 100) AS subject_avg
         FROM quiz_attempts qa
         JOIN question_types qt ON qa.type_id = qt.id
         WHERE qa.student_id = ?
         GROUP BY qt.subject_id`,
        [student.id]
      );
      
      // 3. Calculate T (sum of subject averages) and overall average
      let totalSubjectAvgSum = 0;
      let subjectCount = 0;
      subjectAvgs.forEach(row => {
        if (row.subject_avg !== null) {
          totalSubjectAvgSum += row.subject_avg;
          subjectCount++;
        }
      });
      
      student.total_subject_avg_sum = Math.round(totalSubjectAvgSum * 100) / 100;
      student.overall_avg = subjectCount > 0 
        ? Math.round((totalSubjectAvgSum / subjectCount) * 100) / 100 
        : 0;
    }
    
    res.json(students);
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

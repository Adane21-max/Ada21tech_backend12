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

// ✅ Approve a student + seed Level 1 for all subjects in their grade
exports.approveStudent = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Update the student's status and set current_level = 1
    const [result] = await db.query(
      "UPDATE users SET status = 'approved', current_level = 1 WHERE id = ? AND role = 'student'",
      [id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // 2. Seed Level 1 access for all subjects in their grade
    const [student] = await db.query('SELECT grade FROM users WHERE id = ?', [id]);
    if (student.length > 0) {
      const [subjects] = await db.query('SELECT id FROM subjects WHERE grade = ?', [student[0].grade]);
      for (const subj of subjects) {
        await db.query(
          'INSERT IGNORE INTO student_subject_level (student_id, subject_id, level) VALUES (?, ?, 1)',
          [id, subj.id]
        );
      }
    }

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
    
    for (const student of students) {
      const [typeCount] = await db.query(
        `SELECT COUNT(DISTINCT type_id) AS count FROM quiz_attempts WHERE student_id = ?`,
        [student.id]
      );
      student.quiz_types_taken = typeCount[0].count || 0;
      
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

// ✅ Delete a student + all related records (including new upgrade tables)
exports.deleteStudent = async (req, res) => {
  const { id } = req.params;
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');

    // Delete child records (including the new ones)
    await connection.query('DELETE FROM payments WHERE student_id = ?', [id]);
    await connection.query('DELETE FROM quiz_attempts WHERE student_id = ?', [id]);
    await connection.query('DELETE FROM student_subject_level WHERE student_id = ?', [id]);  // ✅ NEW
    await connection.query('DELETE FROM upgrade_requests WHERE student_id = ?', [id]);        // ✅ NEW

    // Delete the user
    const [result] = await connection.query(
      "DELETE FROM users WHERE id = ? AND role = 'student'",
      [id]
    );

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

// ✅ Get top 10 leaderboard for students (unchanged)
exports.getLeaderboard = async (req, res) => {
  try {
    const { grade } = req.query;
    let studentQuery = `
      SELECT id, username, grade
      FROM users
      WHERE role = 'student'
    `;
    const params = [];
    if (grade) {
      studentQuery += ' AND grade = ?';
      params.push(grade);
    }
    
    const [students] = await db.query(studentQuery, params);
    const leaderboard = [];
    
    for (const student of students) {
      const [subjectCountResult] = await db.query(
        `SELECT COUNT(DISTINCT qt.subject_id) AS subject_count
         FROM quiz_attempts qa
         JOIN question_types qt ON qa.type_id = qt.id
         WHERE qa.student_id = ?`,
        [student.id]
      );
      const subjectCount = subjectCountResult[0].subject_count || 0;
      if (subjectCount === 0) continue;
      
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
      
      let totalSubjectAvgSum = 0;
      subjectAvgs.forEach(row => {
        if (row.subject_avg !== null) {
          totalSubjectAvgSum += row.subject_avg;
        }
      });
      const overallAvg = totalSubjectAvgSum / subjectCount;
      
      leaderboard.push({
        username: student.username,
        grade: student.grade,
        subject_count: subjectCount,
        T: Math.round(totalSubjectAvgSum * 100) / 100,
        Avg: Math.round(overallAvg * 100) / 100
      });
    }
    
    leaderboard.sort((a, b) => b.Avg - a.Avg);
    const top10 = leaderboard.slice(0, 10);
    res.json(top10);
  } catch (error) {
    console.error('Error in getLeaderboard:', error);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

// Student: get current unlocked levels per subject
exports.getMyLevels = async (req, res) => {
  try {
    const studentId = req.user.id;
    const [levels] = await db.query(
      'SELECT subject_id, level FROM student_subject_level WHERE student_id = ?',
      [studentId]
    );
    const result = {};
    levels.forEach(l => { result[l.subject_id] = l.level; });
    res.json(result);
  } catch (error) {
    console.error('Get my levels error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

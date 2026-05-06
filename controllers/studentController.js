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
    await connection.query('DELETE FROM student_subject_level WHERE student_id = ?', [id]);
    await connection.query('DELETE FROM upgrade_requests WHERE student_id = ?', [id]);

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

// ✅ Get Top 10 Leaderboard – overall average, ranked by average
exports.getLeaderboard = async (req, res) => {
  try {
    const { grade } = req.query;
    const params = [];
    let gradeCondition = '';

    if (grade) {
      gradeCondition = ' AND u.grade = ?';
      params.push(grade);
    }

    const query = `
  SELECT 
    u.username,
    u.grade,
    u.current_level,
    COUNT(DISTINCT qt.subject_id) AS subject_count,
    COUNT(qa.id) AS quiz_count,
    ROUND(AVG(qa.score / NULLIF(qa.total_questions, 0) * 100), 2) AS Avg,
    ROUND(SUM(qa.score / NULLIF(qa.total_questions, 0) * 100), 2) AS T
  FROM users u
  JOIN quiz_attempts qa ON u.id = qa.student_id
  JOIN question_types qt ON qa.type_id = qt.id
  WHERE u.role = 'student'${grade ? ' AND u.grade = ?' : ''}
  GROUP BY u.id, u.username, u.grade, u.current_level
  HAVING quiz_count > 0
  ORDER BY u.current_level ASC, Avg DESC
  LIMIT 10
`;

    const [rows] = await db.query(query, params);
    res.json(rows);
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

// Student: get own global current level
exports.getCurrentLevel = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT current_level FROM users WHERE id = ?', [req.user.id]);
    res.json({ level: rows[0]?.current_level || 1 });
  } catch (error) {
    console.error('Get current level error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

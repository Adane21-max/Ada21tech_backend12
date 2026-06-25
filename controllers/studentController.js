const db = require('../config/db');

// ============================================================
// Student Management Functions
// ============================================================

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

// Approve a student + seed Level 1 for all subjects in their grade
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

// Delete a student + all related records (including new upgrade tables)
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

// ============================================================
// Leaderboard & Level Functions
// ============================================================

// Get Top 10 Leaderboard – ranked by quiz_count (desc) then Avg (desc)
exports.getLeaderboard = async (req, res) => {
  try {
    const { grade, level } = req.query;
    console.log('LEADERBOARD REQUEST – grade:', grade, 'level:', level);
    const params = [];
    let whereConditions = "u.role = 'student'";

    if (grade) {
      whereConditions += ' AND u.grade = ?';
      params.push(grade);
    }
    if (level) {
      whereConditions += ' AND u.current_level = ?';
      params.push(level);
    }

    // 1. Fetch all attempts on visible, non‑expired, already‑started quizzes for this grade and level
    const query = `
      SELECT u.id, u.username, u.grade, u.current_level,
             qt.subject_id, qt.id AS type_id, qt.level,
             qa.score, qa.total_questions
      FROM users u
      JOIN quiz_attempts qa ON u.id = qa.student_id
      JOIN question_types qt ON qa.type_id = qt.id
      WHERE ${whereConditions}
        AND qt.is_visible = TRUE
        AND (qt.end_date IS NULL OR qt.end_date >= NOW())
        AND (qt.start_date IS NULL OR qt.start_date <= NOW())
        AND qt.grade = u.grade
    `;

    const [rows] = await db.query(query, params);

    // 2. Fetch student‑subject levels
    const [levels] = await db.query(
      'SELECT student_id, subject_id, level FROM student_subject_level'
    );

    const levelMap = {};
    levels.forEach(l => {
      levelMap[`${l.student_id}_${l.subject_id}`] = l.level;
    });

    // 3. Filter out attempts where quiz level > student's unlocked level (default 1)
    const filtered = rows.filter(r => {
      const unlocked = levelMap[`${r.id}_${r.subject_id}`] ?? 1;
      return r.level <= unlocked;
    });

    // 4. Aggregate
    const studentMap = {};
    filtered.forEach(r => {
      if (!studentMap[r.id]) {
        studentMap[r.id] = {
          username: r.username,
          grade: r.grade,
          subjectSet: new Set(),
          quizTypeSet: new Set(),
          totalPercent: 0,   // sum of (score/max * 100)
          count: 0
        };
      }
      const stu = studentMap[r.id];
      stu.subjectSet.add(r.subject_id);
      stu.quizTypeSet.add(r.type_id);
      stu.totalPercent += (r.score / (r.total_questions || 1)) * 100;
      stu.count += 1;
    });

    let leaderboard = Object.values(studentMap).map(s => {
      const avg = s.totalPercent / s.count;
      return {
        username: s.username,
        grade: s.grade,
        subject_count: s.subjectSet.size,
        quiz_count: s.quizTypeSet.size,      // distinct quizzes
        Avg: avg.toFixed(2),                 // simple average of percentages
        // T is now Average × Quiz Count (normalized total)
        T: (avg * s.quizTypeSet.size).toFixed(2)
      };
    });

    leaderboard.sort((a, b) => b.quiz_count - a.quiz_count || b.Avg - a.Avg);
    leaderboard = leaderboard.slice(0, 10);

    res.json(leaderboard);
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

// ============================================================
// Grade Report & Promotion Functions
// ============================================================

exports.getGradeReport = async (req, res) => {
  try {
    const studentId = parseInt(req.params.id);
    const requestingUserId = req.user.id;
    const isAdmin = req.user.role === 'admin';

    // Students can only view their own report; admins can view any
    if (!isAdmin && requestingUserId !== studentId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Get student's current grade
    const [[student]] = await db.query('SELECT grade FROM users WHERE id = ?', [studentId]);
    if (!student) return res.status(404).json({ message: 'Student not found' });

    // Simplified query – no need to join questions table
    const [attempts] = await db.query(
      `SELECT qa.*, qt.name as quiz_name, s.name as subject_name
       FROM quiz_attempts qa
       JOIN question_types qt ON qa.type_id = qt.id
       JOIN subjects s ON qt.subject_id = s.id
       WHERE qa.student_id = ?
       ORDER BY qa.created_at DESC`,
      [studentId]
    );

    // Build report
    const report = {
      student_id: studentId,
      current_grade: student.grade,
      total_quizzes: attempts.length,
      subjects: {},
      overall_avg: 0
    };

    let totalScore = 0;
    attempts.forEach(attempt => {
      const subject = attempt.subject_name;
      if (!report.subjects[subject]) {
        report.subjects[subject] = { total: 0, count: 0, avg: 0 };
      }
      const score = (attempt.score / attempt.total_questions) * 100;
      report.subjects[subject].total += score;
      report.subjects[subject].count++;
      totalScore += score;
    });

    // Calculate averages
    Object.keys(report.subjects).forEach(subject => {
      report.subjects[subject].avg = Math.round(report.subjects[subject].total / report.subjects[subject].count);
    });

    report.overall_avg = attempts.length > 0 ? Math.round(totalScore / attempts.length) : 0;
    report.next_grade = student.grade + 1;
    report.recommended = report.overall_avg >= 50;

    res.json(report);
  } catch (err) {
    console.error('GET GRADE REPORT ERROR:', err);
    res.status(500).json({ message: 'Server error', error: err.message, stack: err.stack });
  }
};

// Admin: promote a student
exports.promoteStudent = async (req, res) => {
  try {
    const { student_id, promoted_to_grade, avg_score } = req.body;

    if (!student_id || !promoted_to_grade) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Update user
    await db.query(
      `UPDATE users SET 
       promoted_to_grade = ?, 
       promotion_status = 'approved',
       promotion_avg_score = ?,
       promotion_date = NOW()
       WHERE id = ?`,
      [promoted_to_grade, avg_score || null, student_id]
    );

    // Save report
    await db.query(
      `INSERT INTO grade_reports (student_id, grade, avg_score, promoted)
       VALUES (?, ?, ?, ?)`,
      [student_id, promoted_to_grade, avg_score || 0, true]
    );

    res.json({ message: `Student promoted to Grade ${promoted_to_grade} successfully` });
  } catch (err) {
    console.error('PROMOTE STUDENT ERROR:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ============================================================
// ✅ Profile Management Functions (Updated with created_at)
// ============================================================

// GET student profile (for editing)
exports.getProfile = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, username, first_name, middle_name, last_name, grade, status, created_at 
       FROM users WHERE id = ?`,
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('GET PROFILE ERROR:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// UPDATE student profile (first_name, middle_name, last_name, username)
exports.updateProfile = async (req, res) => {
  let connection;
  try {
    console.log('updateProfile called with body:', req.body);
    console.log('User ID:', req.user?.id);
    
    // ✅ Get a connection from the pool
    connection = await db.getConnection();
    
    const { first_name, middle_name, last_name, username } = req.body;
    const userId = req.user.id;

    // Check if username is already taken (by another user)
    if (username) {
      const [existing] = await connection.query('SELECT id FROM users WHERE username = ? AND id != ?', [username, userId]);
      if (existing.length > 0) {
        connection.release();
        return res.status(400).json({ message: 'Username already taken' });
      }
    }

    // ✅ Start transaction
    await connection.beginTransaction();

    // 🔍 DEBUG: Check if user exists before UPDATE
    const [checkUser] = await connection.query('SELECT id FROM users WHERE id = ?', [userId]);
    console.log('✅ User exists check:', checkUser);

    // ✅ Execute UPDATE within transaction
    const [result] = await connection.query(
      `UPDATE users SET 
       first_name = ?, middle_name = ?, last_name = ?, username = ?
       WHERE id = ?`,
      [first_name || null, middle_name || null, last_name || null, username, userId]
    );

    console.log('✅ UPDATE result:', result);
    console.log('✅ Affected rows:', result.affectedRows);
    console.log('✅ Changed rows:', result.changedRows);

    // ✅ Commit the transaction
    await connection.commit();

    // Fetch updated user with created_at
    const [updated] = await connection.query(
      `SELECT id, username, first_name, middle_name, last_name, grade, status, created_at 
       FROM users WHERE id = ?`,
      [userId]
    );

    console.log('✅ After UPDATE (from DB):', updated[0]);

    connection.release();
    res.json({ message: 'Profile updated successfully', user: updated[0] });
  } catch (err) {
    // ✅ Rollback on error
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    console.error('UPDATE PROFILE ERROR:', err);
    res.status(500).json({ 
      message: 'Server error', 
      error: err.message,
      stack: err.stack 
    });
  }
};

// CHANGE password
exports.changePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const userId = req.user.id;

    if (!current_password || !new_password) {
      return res.status(400).json({ message: 'Current and new password required' });
    }

    // Get current hashed password
    const [rows] = await db.query('SELECT password FROM users WHERE id = ?', [userId]);
    if (rows.length === 0) return res.status(404).json({ message: 'User not found' });

    const bcrypt = require('bcrypt');
    const valid = await bcrypt.compare(current_password, rows[0].password);
    if (!valid) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    const hashed = await bcrypt.hash(new_password, 10);
    await db.query('UPDATE users SET password = ? WHERE id = ?', [hashed, userId]);

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('CHANGE PASSWORD ERROR:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

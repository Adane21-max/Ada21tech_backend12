const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));

const db = require('./config/db');
const { authenticate, isAdmin } = require('./middleware/authMiddleware');
// ✅ ADD MULTER HERE
const multer = require('multer');
const path = require('path');
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });
// =====================
// AUTO-INITIALIZE ALL TABLES ON STARTUP
// =====================
async function initializeTables() {
  try {
    // Subjects table
    await db.query(`CREATE TABLE IF NOT EXISTS subjects (id INT AUTO_INCREMENT PRIMARY KEY, grade INT NOT NULL, name VARCHAR(100) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    console.log('✅ subjects table ready');

        // ✅ Auto-update subjects.grade based on subject name
    try {
      const [subjects] = await db.query('SELECT id, name, grade FROM subjects');
      let updatedCount = 0;

      for (const subject of subjects) {
        let grade = null;
        const name = subject.name || '';

        // Try to extract grade from name using common patterns
        const match = name.match(/\b(6|7|8|9|10|11|12)\b/);
        if (match) {
          grade = parseInt(match[1]);
        } else if (name.toLowerCase().includes('grade 6')) grade = 6;
        else if (name.toLowerCase().includes('grade 7')) grade = 7;
        else if (name.toLowerCase().includes('grade 8')) grade = 8;
        else if (name.toLowerCase().includes('grade 9')) grade = 9;
        else if (name.toLowerCase().includes('grade 10')) grade = 10;
        else if (name.toLowerCase().includes('grade 11')) grade = 11;
        else if (name.toLowerCase().includes('grade 12')) grade = 12;

        // Default for subjects without a number in the name
        if (grade === null && (name === 'Global' || name === 'English' || name === 'Global (upgrades)')) {
          grade = 6; // adjust based on your data
        }

        if (grade !== null && subject.grade !== grade) {
          await db.query('UPDATE subjects SET grade = ? WHERE id = ?', [grade, subject.id]);
          updatedCount++;
          console.log(`📝 Updated subject "${name}" to grade ${grade}`);
        }
      }

      if (updatedCount === 0) {
        console.log('✅ All subjects already have correct grades.');
      } else {
        console.log(`✅ Updated ${updatedCount} subject(s) with correct grades.`);
      }
    } 
    catch (err) {
      console.error('❌ Failed to auto-update subjects.grade:', err.message);
    }
    
    // Question types table
    await db.query(`CREATE TABLE IF NOT EXISTS question_types (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL, grade INT NOT NULL, subject_id INT NOT NULL, level INT DEFAULT 1 NOT NULL, total_time INT DEFAULT NULL, is_visible BOOLEAN DEFAULT TRUE, start_date DATETIME NULL, end_date DATETIME NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE)`);
    console.log('✅ question_types table ready');

    // Questions table
    await db.query(`CREATE TABLE IF NOT EXISTS questions (id INT AUTO_INCREMENT PRIMARY KEY, grade INT NOT NULL, level VARCHAR(20), type_id INT NOT NULL, question TEXT NOT NULL, optionA VARCHAR(255) NOT NULL, optionB VARCHAR(255) NOT NULL, optionC VARCHAR(255) NOT NULL, optionD VARCHAR(255) NOT NULL, correct_answer CHAR(1) NOT NULL, explanation TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (type_id) REFERENCES question_types(id) ON DELETE CASCADE)`);
    console.log('✅ questions table ready');

    // Free trial questions
    await db.query(`CREATE TABLE IF NOT EXISTS free_trial_questions (id INT AUTO_INCREMENT PRIMARY KEY, grade INT NOT NULL, subject VARCHAR(100) NOT NULL, question TEXT NOT NULL, optionA VARCHAR(255) NOT NULL, optionB VARCHAR(255) NOT NULL, optionC VARCHAR(255) NOT NULL, optionD VARCHAR(255) NOT NULL, correct_answer CHAR(1) NOT NULL, explanation TEXT, time_limit INT DEFAULT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    console.log('✅ free_trial_questions table ready');

    // Announcements
    await db.query(`CREATE TABLE IF NOT EXISTS announcements (id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(200) NOT NULL, content TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, expires_at TIMESTAMP NULL)`);
    console.log('✅ announcements table ready');

    // Payments – UPDATED with new columns
    await db.query(`CREATE TABLE IF NOT EXISTS payments (id INT AUTO_INCREMENT PRIMARY KEY, student_id INT NOT NULL, payer_name VARCHAR(255) NOT NULL, transaction_ref VARCHAR(100) NOT NULL, status ENUM('pending','approved','rejected') DEFAULT 'pending', reason VARCHAR(255), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE)`);
    console.log('✅ payments table ready');

    // Ensure new columns exist (for existing tables)
    const [columns] = await db.query("SHOW COLUMNS FROM payments LIKE 'payer_name'");
    if (columns.length === 0) {
      await db.query("ALTER TABLE payments ADD COLUMN payer_name VARCHAR(255) NOT NULL");
      console.log('✅ Added payer_name column to payments');
    }
    const [txnCols] = await db.query("SHOW COLUMNS FROM payments LIKE 'transaction_ref'");
    if (txnCols.length === 0) {
      await db.query("ALTER TABLE payments ADD COLUMN transaction_ref VARCHAR(100) NOT NULL");
      console.log('✅ Added transaction_ref column to payments');
    }
    const [receiptCol] = await db.query("SHOW COLUMNS FROM payments LIKE 'receipt_image'");
    if (receiptCol.length > 0) {
      await db.query("ALTER TABLE payments DROP COLUMN receipt_image");
      console.log('✅ Dropped receipt_image column from payments');
    }

    // Quiz attempts
    await db.query(`CREATE TABLE IF NOT EXISTS quiz_attempts (id INT AUTO_INCREMENT PRIMARY KEY, student_id INT NOT NULL, type_id INT NOT NULL, score INT, total_questions INT, time_taken INT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (type_id) REFERENCES question_types(id) ON DELETE CASCADE)`);
    console.log('✅ quiz_attempts table ready');

    // Ensure answers column exists in quiz_attempts
    try {
      const [answerCols] = await db.query("SHOW COLUMNS FROM quiz_attempts LIKE 'answers'");
      if (answerCols.length === 0) {
        await db.query("ALTER TABLE quiz_attempts ADD COLUMN answers TEXT NULL AFTER time_taken");
        console.log('✅ Added missing answers column to quiz_attempts');
      } else {
        console.log('✅ answers column already exists in quiz_attempts');
      }
    } catch (err) {
      console.error('❌ Failed to ensure answers column:', err.message);
    }

    // =====================
    // UPGRADE SYSTEM TABLES (needed for later, but harmless now)
    // =====================

    // Ensure 'level' column exists in question_types
    try {
      const [levelCol] = await db.query("SHOW COLUMNS FROM question_types LIKE 'level'");
      if (levelCol.length === 0) {
        await db.query("ALTER TABLE question_types ADD COLUMN level INT DEFAULT 1 NOT NULL AFTER subject_id");
        console.log('✅ Added level column to question_types');
      } else {
        console.log('✅ level column already exists in question_types');
      }
    } catch (err) {
      console.error('❌ Failed to add level column:', err.message);
    }

    // Student subject level tracker
    await db.query(`CREATE TABLE IF NOT EXISTS student_subject_level (id INT AUTO_INCREMENT PRIMARY KEY, student_id INT NOT NULL, subject_id INT NOT NULL, level INT NOT NULL DEFAULT 1, UNIQUE KEY unique_student_subject (student_id, subject_id), FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE)`);
    console.log('✅ student_subject_level table ready');

    // Upgrade requests
    await db.query(`CREATE TABLE IF NOT EXISTS upgrade_requests (id INT AUTO_INCREMENT PRIMARY KEY, student_id INT NOT NULL, subject_id INT NULL, from_level INT NOT NULL, to_level INT NOT NULL, average_score DECIMAL(5,2) NOT NULL, status ENUM('pending','approved','rejected') DEFAULT 'pending', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE)`);
    console.log('✅ upgrade_requests table ready');

    await db.query(`
  CREATE TABLE IF NOT EXISTS lesson_notes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    grade INT NOT NULL,
    subject_id INT NOT NULL,
    level INT DEFAULT 1,
    activity JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )
`);
console.log('✅ lesson_notes table ready');

    // ============================================================
// Grade Reports table
// ============================================================
await db.query(`
  CREATE TABLE IF NOT EXISTS grade_reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    grade INT NOT NULL,
    avg_score DECIMAL(5,2) NOT NULL,
    promoted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);
console.log('✅ grade_reports table ready');
    // ============================================================
    // Competition Tables
    // ============================================================
    try {
      // Competitions table
      await db.query(`
        CREATE TABLE IF NOT EXISTS competitions (
          id INT AUTO_INCREMENT PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          grade INT NOT NULL,
          subject_id INT NOT NULL,
          level INT DEFAULT 1,
          start_time DATETIME NOT NULL,
          end_time DATETIME NOT NULL,
          total_questions INT DEFAULT 10,
          is_active BOOLEAN DEFAULT TRUE,
          month_year VARCHAR(7) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
        )
      `);
      console.log('✅ competitions table ready');

      // Competition attempts table
      await db.query(`
        CREATE TABLE IF NOT EXISTS competition_attempts (
          id INT AUTO_INCREMENT PRIMARY KEY,
          competition_id INT NOT NULL,
          student_id INT NOT NULL,
          score INT DEFAULT 0,
          total_questions INT DEFAULT 0,
          correct_count INT DEFAULT 0,
          wrong_count INT DEFAULT 0,
          time_taken INT DEFAULT 0,
          completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          is_winner BOOLEAN DEFAULT FALSE,
          FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
          FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
          UNIQUE KEY unique_competition_student (competition_id, student_id)
        )
      `);
      console.log('✅ competition_attempts table ready');

      // Competition answers table
      await db.query(`
        CREATE TABLE IF NOT EXISTS competition_answers (
          id INT AUTO_INCREMENT PRIMARY KEY,
          attempt_id INT NOT NULL,
          question_id INT NOT NULL,
          selected_answer CHAR(1),
          is_correct BOOLEAN DEFAULT FALSE,
          FOREIGN KEY (attempt_id) REFERENCES competition_attempts(id) ON DELETE CASCADE
        )
      `);
      console.log('✅ competition_answers table ready');
    // Insert default competition if none exists
const [existingCompetition] = await db.query('SELECT id FROM competitions LIMIT 1');
if (existingCompetition.length === 0) {
  // Get any valid subject ID
  const [subject] = await db.query('SELECT id FROM subjects LIMIT 1');
  const subjectId = subject.length > 0 ? subject[0].id : 1;
  
  await db.query(
    `INSERT INTO competitions 
     (title, description, grade, subject_id, level, start_time, end_time, total_questions, month_year) 
     VALUES (?, ?, ?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 30 DAY), ?, DATE_FORMAT(NOW(), '%Y-%m'))`,
    [
      'Monthly Challenge',
      "Complete this month's competition to win a free level upgrade!",
      6,
      subjectId,
      1,
      10
    ]
  );
  console.log('✅ Default competition inserted.');
}
    } catch (err) {
      console.error('❌ Failed to ensure competition tables:', err.message);
    }
    
    // 🔧 Ensure payer_name / transaction_ref columns exist in upgrade_requests
    try {
      const [payerCol] = await db.query("SHOW COLUMNS FROM upgrade_requests LIKE 'payer_name'");
      if (payerCol.length === 0) {
        await db.query("ALTER TABLE upgrade_requests ADD COLUMN payer_name VARCHAR(255) AFTER average_score");
        console.log('✅ Added payer_name column to upgrade_requests');
      }
      const [txnCol] = await db.query("SHOW COLUMNS FROM upgrade_requests LIKE 'transaction_ref'");
      if (txnCol.length === 0) {
        await db.query("ALTER TABLE upgrade_requests ADD COLUMN transaction_ref VARCHAR(100) AFTER payer_name");
        console.log('✅ Added transaction_ref column to upgrade_requests');
      }
    } catch (err) {
      console.error('❌ Failed to add payment columns:', err.message);
    }
    // Ensure admin user exists
    await db.query(`INSERT INTO users (username, password, role, status) VALUES ('admin', '$2b$10$t1H.F7BUbEVvZIR9FEpfbOYkaFCIcQPet01BMNWpIsr.ljoD6Jiq.', 'admin', 'approved') ON DUPLICATE KEY UPDATE password = VALUES(password), role = VALUES(role), status = VALUES(status)`);

    // Ensure current_level column exists in users
    try {
      const [levelCol] = await db.query("SHOW COLUMNS FROM users LIKE 'current_level'");
      if (levelCol.length === 0) {
        await db.query("ALTER TABLE users ADD COLUMN current_level INT DEFAULT 1 NOT NULL");
        await db.query("UPDATE users SET current_level = 1 WHERE role = 'student'");
        console.log('✅ Added current_level column to users');
      } else {
        console.log('✅ current_level column already exists in users');
      }
    } catch (err) {
      console.error('❌ Failed to ensure current_level column:', err.message);
    }
    // ============================================================
// Ensure profile columns exist (first_name, middle_name, last_name)
// ============================================================
try {
  const [fNameCol] = await db.query("SHOW COLUMNS FROM users LIKE 'first_name'");
  if (fNameCol.length === 0) {
    await db.query("ALTER TABLE users ADD COLUMN first_name VARCHAR(100) DEFAULT NULL");
    console.log('✅ Added first_name column to users');
  } else {
    console.log('✅ first_name column already exists in users');
  }

  const [mNameCol] = await db.query("SHOW COLUMNS FROM users LIKE 'middle_name'");
  if (mNameCol.length === 0) {
    await db.query("ALTER TABLE users ADD COLUMN middle_name VARCHAR(100) DEFAULT NULL");
    console.log('✅ Added middle_name column to users');
  } else {
    console.log('✅ middle_name column already exists in users');
  }

  const [lNameCol] = await db.query("SHOW COLUMNS FROM users LIKE 'last_name'");
  if (lNameCol.length === 0) {
    await db.query("ALTER TABLE users ADD COLUMN last_name VARCHAR(100) DEFAULT NULL");
    console.log('✅ Added last_name column to users');
  } else {
    console.log('✅ last_name column already exists in users');
  }
} catch (err) {
  console.error('❌ Failed to ensure profile columns:', err.message);
}

// ============================================================
// ✅ ADD THIS NEW CODE HERE
// ============================================================
try {
  const [promotedCol] = await db.query("SHOW COLUMNS FROM users LIKE 'promoted_to_grade'");
  if (promotedCol.length === 0) {
    await db.query("ALTER TABLE users ADD COLUMN promoted_to_grade INT DEFAULT NULL");
    console.log('✅ Added promoted_to_grade column to users');
  } else {
    console.log('✅ promoted_to_grade column already exists in users');
  }

  const [statusCol] = await db.query("SHOW COLUMNS FROM users LIKE 'promotion_status'");
  if (statusCol.length === 0) {
    await db.query("ALTER TABLE users ADD COLUMN promotion_status ENUM('pending','approved','rejected') DEFAULT NULL");
    console.log('✅ Added promotion_status column to users');
  } else {
    console.log('✅ promotion_status column already exists in users');
  }

  const [avgCol] = await db.query("SHOW COLUMNS FROM users LIKE 'promotion_avg_score'");
  if (avgCol.length === 0) {
    await db.query("ALTER TABLE users ADD COLUMN promotion_avg_score DECIMAL(5,2) DEFAULT NULL");
    console.log('✅ Added promotion_avg_score column to users');
  } else {
    console.log('✅ promotion_avg_score column already exists in users');
  }

  const [dateCol] = await db.query("SHOW COLUMNS FROM users LIKE 'promotion_date'");
  if (dateCol.length === 0) {
    await db.query("ALTER TABLE users ADD COLUMN promotion_date TIMESTAMP DEFAULT NULL");
    console.log('✅ Added promotion_date column to users');
  } else {
    console.log('✅ promotion_date column already exists in users');
  }
} catch (err) {
  console.error('❌ Failed to ensure promotion columns:', err.message);
}
        // ============================================================
    // Ensure staff columns exist (permissions, role)
    // ============================================================
    try {
      // Add permissions column if missing
      const [permCol] = await db.query("SHOW COLUMNS FROM users LIKE 'permissions'");
      if (permCol.length === 0) {
        await db.query("ALTER TABLE users ADD COLUMN permissions JSON DEFAULT NULL");
        console.log('✅ Added permissions column to users');
      } else {
        console.log('✅ permissions column already exists in users');
      }

      // Ensure role enum includes 'staff'
      const [roleCol] = await db.query("SHOW COLUMNS FROM users LIKE 'role'");
      if (roleCol.length > 0) {
        const roleType = roleCol[0].Type;
        // Check if 'staff' is already in the enum
        if (!roleType.includes("'staff'")) {
          await db.query("ALTER TABLE users MODIFY role ENUM('admin', 'student', 'staff') DEFAULT 'student'");
          console.log('✅ Updated role enum to include staff');
        } else {
          console.log('✅ role already includes staff');
        }
      }
    } catch (err) {
      console.error('❌ Failed to ensure staff columns:', err.message);
    }

console.log('✅ admin user verified');
        // ============================================================
    // Ensure staff columns exist (permissions, role)
    // ============================================================
    try {
      const [permCol] = await db.query("SHOW COLUMNS FROM users LIKE 'permissions'");
      if (permCol.length === 0) {
        await db.query("ALTER TABLE users ADD COLUMN permissions JSON DEFAULT NULL");
        console.log('✅ Added permissions column to users');
      } else {
        console.log('✅ permissions column already exists in users');
      }

      const [roleCol] = await db.query("SHOW COLUMNS FROM users LIKE 'role'");
      if (roleCol.length > 0) {
        const roleType = roleCol[0].Type;
        if (!roleType.includes("'staff'")) {
          await db.query("ALTER TABLE users MODIFY role ENUM('admin', 'student', 'staff') DEFAULT 'student'");
          console.log('✅ Updated role enum to include staff');
        } else {
          console.log('✅ role already includes staff');
        }
      }
    } catch (err) {
      console.error('❌ Failed to ensure staff columns:', err.message);
    }

  } catch (err) {
    console.error('❌ Table initialization error:', err.message);
  }
}
initializeTables();

// =====================
// ROUTES (external)
// =====================
const authRoutes = require('./routes/auth');
const subjectRoutes = require('./routes/subjects');
const questionRoutes = require('./routes/questions');
const freeTrialRoutes = require('./routes/freeTrial');
const announcementRoutes = require('./routes/announcements');
const studentRoutes = require('./routes/students');
const paymentRoutes = require('./routes/payments');
const questionTypeRoutes = require('./routes/questionTypes');
const competitionRoutes = require('./routes/competitions');

app.use('/api/auth', authRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/free-trial', freeTrialRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/question-types', questionTypeRoutes);
app.use('/api/competitions', competitionRoutes); 

// Lesson Notes Routes
const lessonNoteRoutes = require('./routes/lessonNotes');
app.use('/api/lesson-notes', lessonNoteRoutes);
// ✅ ADD UPLOAD ROUTE
app.post('/api/upload', authenticate, isAdmin, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// ==========================
// ATTEMPT ROUTES (inline)
// ==========================
const attemptRouter = require('express').Router();
const { saveAttempt, getStudentAttempts, getAttemptDetails } = require('./controllers/attemptController');

attemptRouter.post('/', authenticate, saveAttempt);
attemptRouter.get('/', authenticate, getStudentAttempts);
attemptRouter.get('/:id', authenticate, getAttemptDetails);

app.use('/api/attempts', attemptRouter);

// ==========================
// UPGRADE ROUTES (inline)
// ==========================
const upgradeRouter = require('express').Router();

// --- Handlers (use existing `authenticate` and `isAdmin` from outer scope) ---

const upgradeRequest = async (req, res) => {
  try {
    // ✅ Extract and validate payment fields
    const { payer_name, transaction_ref } = req.body;
    if (!payer_name || !transaction_ref) {
      return res.status(400).json({msg:'Please provide your full name and transaction reference.'});
    }

    const sid = req.user.id;
    const grd = req.user.grade;
    const [[u]] = await db.query('SELECT current_level FROM users WHERE id = ?', [sid]);
    if (!u) return res.status(400).json({msg:'User not found'});
    const lvl = u.current_level;
        // Count ONLY attempts on currently visible, non-expired quizzes
    const [[countRow]] = await db.query(
      `SELECT COUNT(qa.id) AS count
       FROM quiz_attempts qa
       JOIN question_types qt ON qa.type_id = qt.id
       WHERE qa.student_id = ?
         AND qt.is_visible = TRUE
         AND (qt.end_date IS NULL OR qt.end_date >= NOW())`,
      [sid]
    );
    const totalAttempted = countRow.count;

    if (totalAttempted < 15) {
      return res.status(400).json({
        msg: `You have completed only ${totalAttempted} visible quiz(zes). Complete at least 15 to request an upgrade.`
      });
    }

    // Calculate average from those SAME attempts
    const [a] = await db.query(
      `SELECT qa.score, qa.total_questions
       FROM quiz_attempts qa
       JOIN question_types qt ON qa.type_id = qt.id
       WHERE qa.student_id = ?
         AND qt.is_visible = TRUE
         AND (qt.end_date IS NULL OR qt.end_date >= NOW())`,
      [sid]
    );
    let sum = 0;
    a.forEach(r => sum += (r.score / r.total_questions) * 100);
    const avg = sum / a.length;
    if (avg < 50) return res.status(400).json({ msg: `Avg ${avg.toFixed(1)}%, need 50%` });
    const [ex] = await db.query("SELECT id FROM upgrade_requests WHERE student_id=? AND subject_id = 0 AND status='pending'",[sid]);
    if (ex.length) return res.status(400).json({msg:'Pending already exists'});

    // Temporarily disable foreign key checks for this connection
    await db.query('SET FOREIGN_KEY_CHECKS = 0');
    await db.query('INSERT INTO upgrade_requests (student_id,subject_id,from_level,to_level,average_score,payer_name,transaction_ref) VALUES (?,0,?,?,?,?,?)', [sid, lvl, lvl+1, avg, payer_name, transaction_ref]);
    await db.query('SET FOREIGN_KEY_CHECKS = 1');

    res.json({msg:`Request to Level ${lvl+1} submitted`});
  } catch(e) { console.error(e); res.status(500).json({msg:'Server error'}); }
};

const getUpgradeReqs = async (req, res) => {
  try {
    const [rows] = await db.query("SELECT ur.*, u.username, CASE WHEN ur.subject_id = 0 THEN 'All subjects' ELSE s.name END AS subject_name FROM upgrade_requests ur JOIN users u ON ur.student_id=u.id LEFT JOIN subjects s ON ur.subject_id=s.id ORDER BY ur.created_at DESC");
    res.json(rows);
  } catch(e) { console.error(e); res.status(500).json({msg:'Server error'}); }
};

const approveUpgradeReq = async (req, res) => {
  try {
    const {id} = req.params;
    const [[r]] = await db.query('SELECT * FROM upgrade_requests WHERE id=?',[id]);
    if (!r) return res.status(404).json({msg:'Not found'});

    const studentId = r.student_id;
    const toLevel = r.to_level;

    // 1. Seed any missing subject-level rows for this student (Level 1 by default)
    await db.query(
      `INSERT IGNORE INTO student_subject_level (student_id, subject_id, level)
       SELECT u.id, s.id, 1
       FROM users u
       JOIN subjects s ON u.grade = s.grade
       WHERE u.id = ? AND u.role = 'student'`,
      [studentId]
    );

    // 2. Update global level
    await db.query('UPDATE users SET current_level=? WHERE id=?', [toLevel, studentId]);

    // 3. Sync all existing subject rows to the new level
    await db.query('UPDATE student_subject_level SET level=? WHERE student_id=?', [toLevel, studentId]);

    // 4. Mark request as approved
    await db.query("UPDATE upgrade_requests SET status='approved' WHERE id=?", [id]);
    res.json({msg:`Approved Level ${toLevel}`});
  } catch(e) {
    console.error(e);
    res.status(500).json({msg:'Server error'});
  }
};

const rejectUpgradeReq = async (req, res) => {
  try {
    await db.query("UPDATE upgrade_requests SET status='rejected' WHERE id=?",[req.params.id]);
    res.json({msg:'Rejected'});
  } catch(e) { console.error(e); res.status(500).json({msg:'Server error'}); }
};

const getPendingUpgrade = async (req, res) => {
  try {
    const [rows] = await db.query("SELECT id FROM upgrade_requests WHERE student_id=? AND subject_id = 0 AND status='pending'",[req.user.id]);
    res.json({pending: rows.length>0});
  } catch(e) { console.error(e); res.status(500).json({msg:'Server error'}); }
};

// --- Mount routes (use the already declared authenticate/isAdmin) ---
upgradeRouter.post('/request', authenticate, upgradeRequest);
upgradeRouter.get('/pending', authenticate, getPendingUpgrade);
upgradeRouter.get('/', authenticate, isAdmin, getUpgradeReqs);
upgradeRouter.put('/:id/approve', authenticate, isAdmin, approveUpgradeReq);
upgradeRouter.put('/:id/reject', authenticate, isAdmin, rejectUpgradeReq);

app.use('/api/upgrades', upgradeRouter);

// TEMPORARY route – full visibility sync for all students (run once and remove)
app.get('/api/admin/sync-student-visibility', async (req, res) => {
  try {
    // 1. Insert missing rows for all students (current_level)
    await db.query(`
      INSERT IGNORE INTO student_subject_level (student_id, subject_id, level)
      SELECT u.id, s.id, u.current_level
      FROM users u
      JOIN subjects s ON u.grade = s.grade
      WHERE u.role = 'student'
    `);

    // 2. Update existing rows to match the student's current_level
    const [updateResult] = await db.query(`
      UPDATE student_subject_level ssl
      JOIN users u ON ssl.student_id = u.id
      SET ssl.level = u.current_level
      WHERE u.role = 'student'
    `);

    res.json({
      message: 'Visibility synced for all students.',
      updatedRows: updateResult.changedRows || 0
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Sync failed', error: err.message });
  }
});
// =====================
// HEALTH CHECK
// =====================
app.get('/', (req, res) => res.send('Ada21Tech API is running...'));
app.get('/api/ping', (req, res) => res.json({ message: 'pong', env: !!process.env.JWT_SECRET, db: !!process.env.MYSQLHOST }));

app.get('/api/test-update', async (req, res) => {
  try {
    const [result] = await db.query(
      "UPDATE users SET first_name = 'Test' WHERE id = 1320"
    );
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =====================
// DEBUG ROUTE – Check user data in database
// =====================
app.get('/api/debug-user', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const [rows] = await db.query(
      'SELECT id, username, first_name, middle_name, last_name FROM users WHERE id = ?',
      [userId]
    );
    const [dbName] = await db.query('SELECT DATABASE() as db');
    const [host] = await db.query('SELECT @@hostname as host');
    res.json({ 
      user: rows[0] || null,
      database: dbName[0].db,
      host: host[0].host,
      userId: userId
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 404 HANDLER
app.use((req, res) => res.status(404).json({ message: 'Route not found' }));

const fs = require('fs');
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
  console.log('✅ Created uploads folder');
}
app.get('/api/debug-db', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        DATABASE() AS database_name,
        @@hostname AS host_name,
        @@port AS port_number
    `);

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get('/api/create-lesson-notes-table', async (req, res) => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS lesson_notes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        grade INT NOT NULL,
        subject_id INT NOT NULL,
        level INT DEFAULT 1,
        activity JSON NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    res.send('✅ Table "lesson_notes" created successfully in the backend\'s database.');
  } catch (err) {
    res.status(500).send('❌ Error: ' + err.message);
  }
});
// START SERVER
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));

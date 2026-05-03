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
// =====================
// AUTO-INITIALIZE ALL TABLES ON STARTUP
// =====================
async function initializeTables() {
  try {
    // Subjects table
    await db.query(`CREATE TABLE IF NOT EXISTS subjects (id INT AUTO_INCREMENT PRIMARY KEY, grade INT NOT NULL, name VARCHAR(100) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    console.log('✅ subjects table ready');

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
    // Upgrade requests
    await db.query(`CREATE TABLE IF NOT EXISTS upgrade_requests (id INT AUTO_INCREMENT PRIMARY KEY, student_id INT NOT NULL, subject_id INT NULL, from_level INT NOT NULL, to_level INT NOT NULL, average_score DECIMAL(5,2) NOT NULL, status ENUM('pending','approved','rejected') DEFAULT 'pending', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE)`);
    console.log('✅ upgrade_requests table ready');

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
    console.log('✅ admin user verified');
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

app.use('/api/auth', authRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/free-trial', freeTrialRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/question-types', questionTypeRoutes);

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
    const [q] = await db.query('SELECT id FROM question_types WHERE grade=? AND level=? AND is_visible=1',[grd,lvl]);
    if (!q.length) return res.status(400).json({msg:'No quizzes'});
    const ids = q.map(r=>r.id);
    const [a] = await db.query('SELECT type_id,score,total_questions FROM quiz_attempts WHERE student_id=? AND type_id IN (?)',[sid,ids]);
    if (a.length !== ids.length) return res.status(400).json({msg:'Complete all quizzes first'});
    let sum=0;
    a.forEach(r=> sum += (r.score/r.total_questions)*100);
    const avg = sum/a.length;
    if (avg < 50) return res.status(400).json({msg:`Avg ${avg.toFixed(1)}%, need 50%`});
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

// 404 HANDLER
app.use((req, res) => res.status(404).json({ message: 'Route not found' }));

// START SERVER
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));

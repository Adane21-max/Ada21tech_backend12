// Remove dotenv on Railway – environment variables are injected directly

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));

// DB
const db = require('./config/db');

// =====================
// AUTO-INITIALIZE ALL TABLES ON STARTUP
// =====================
async function initializeTables() {
  try {
    // Subjects table
    await db.query(`
      CREATE TABLE IF NOT EXISTS subjects (
        id INT AUTO_INCREMENT PRIMARY KEY,
        grade INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ subjects table ready');

    // Question types table
    await db.query(`
      CREATE TABLE IF NOT EXISTS question_types (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        grade INT NOT NULL,
        subject_id INT NOT NULL,
        level INT DEFAULT 1 NOT NULL,
        total_time INT DEFAULT NULL,
        is_visible BOOLEAN DEFAULT TRUE,
        start_date DATETIME NULL,
        end_date DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
      )
    `);
    console.log('✅ question_types table ready');

    // Questions table
    await db.query(`
      CREATE TABLE IF NOT EXISTS questions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        grade INT NOT NULL,
        level VARCHAR(20),
        type_id INT NOT NULL,
        question TEXT NOT NULL,
        optionA VARCHAR(255) NOT NULL,
        optionB VARCHAR(255) NOT NULL,
        optionC VARCHAR(255) NOT NULL,
        optionD VARCHAR(255) NOT NULL,
        correct_answer CHAR(1) NOT NULL,
        explanation TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (type_id) REFERENCES question_types(id) ON DELETE CASCADE
      )
    `);
    console.log('✅ questions table ready');

    // Free trial questions
    await db.query(`
      CREATE TABLE IF NOT EXISTS free_trial_questions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        grade INT NOT NULL,
        subject VARCHAR(100) NOT NULL,
        question TEXT NOT NULL,
        optionA VARCHAR(255) NOT NULL,
        optionB VARCHAR(255) NOT NULL,
        optionC VARCHAR(255) NOT NULL,
        optionD VARCHAR(255) NOT NULL,
        correct_answer CHAR(1) NOT NULL,
        explanation TEXT,
        time_limit INT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ free_trial_questions table ready');

    // Announcements
    await db.query(`
      CREATE TABLE IF NOT EXISTS announcements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NULL
      )
    `);
    console.log('✅ announcements table ready');

    // Payments – UPDATED with new columns
    await db.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id INT NOT NULL,
        payer_name VARCHAR(255) NOT NULL,
        transaction_ref VARCHAR(100) NOT NULL,
        status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
        reason VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('✅ payments table ready');

    // 🔧 Ensure new columns exist (for existing tables)
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

    // 🔥 CRITICAL: Remove deprecated receipt_image column if it still exists
    const [receiptCol] = await db.query("SHOW COLUMNS FROM payments LIKE 'receipt_image'");
    if (receiptCol.length > 0) {
      await db.query("ALTER TABLE payments DROP COLUMN receipt_image");
      console.log('✅ Dropped receipt_image column from payments');
    }

    // Quiz attempts
    await db.query(`
      CREATE TABLE IF NOT EXISTS quiz_attempts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id INT NOT NULL,
        type_id INT NOT NULL,
        score INT,
        total_questions INT,
        time_taken INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (type_id) REFERENCES question_types(id) ON DELETE CASCADE
      )
    `);
    console.log('✅ quiz_attempts table ready');

    // 🔧 Ensure answers column exists in quiz_attempts (idempotent – safe to run every deploy)
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
    // UPGRADE SYSTEM TABLES
    // =====================

    // 🔧 Ensure 'level' column exists in question_types (safe to run always)
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
    await db.query(`
      CREATE TABLE IF NOT EXISTS student_subject_level (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id INT NOT NULL,
        subject_id INT NOT NULL,
        level INT NOT NULL DEFAULT 1,
        UNIQUE KEY unique_student_subject (student_id, subject_id),
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
      )
    `);
    console.log('✅ student_subject_level table ready');

    // Upgrade requests
    await db.query(`
      CREATE TABLE IF NOT EXISTS upgrade_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id INT NOT NULL,
        subject_id INT NOT NULL,
        from_level INT NOT NULL,
        to_level INT NOT NULL,
        average_score DECIMAL(5,2) NOT NULL,
        status ENUM('pending','approved','rejected') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
      )
    `);
    console.log('✅ upgrade_requests table ready');

    // Ensure admin user exists
    await db.query(`
      INSERT INTO users (username, password, role, status) 
      VALUES ('admin', '$2b$10$t1H.F7BUbEVvZIR9FEpfbOYkaFCIcQPet01BMNWpIsr.ljoD6Jiq.', 'admin', 'approved')
      ON DUPLICATE KEY UPDATE password = VALUES(password), role = VALUES(role), status = VALUES(status)
    `);
        // 🔧 Ensure current_level column exists in users
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

// Run table initialization on startup
initializeTables();

// =====================
// ROUTES
// =====================
const authRoutes = require('./routes/auth');
const subjectRoutes = require('./routes/subjects');
const questionRoutes = require('./routes/questions');
const freeTrialRoutes = require('./routes/freeTrial');
const announcementRoutes = require('./routes/announcements');
const studentRoutes = require('./routes/students');
const paymentRoutes = require('./routes/payments');
const questionTypeRoutes = require('./routes/questionTypes');
const attemptRoutes = require('./routes/attempts');
const upgradeRoutes = require('./routes/upgrades');

app.use('/api/auth', authRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/free-trial', freeTrialRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/question-types', questionTypeRoutes);
app.use('/api/attempts', attemptRoutes);
app.use('/api/upgrades', upgradeRoutes);             // <-- NEW

// =====================
// HEALTH CHECK
// =====================
app.get('/', (req, res) => {
  res.send('Ada21Tech API is running...');
});
app.get('/api/check-secret', (req, res) => {
  res.json({ secret: process.env.JWT_SECRET ? 'SET' : 'MISSING' });
});
app.get('/api/ping', (req, res) => {
  res.json({ message: 'pong', env: !!process.env.JWT_SECRET, db: !!process.env.MYSQLHOST });
});

// =====================
// 404 HANDLER
// =====================
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// =====================
// START SERVER
// =====================
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

server.on('error', (err) => {
  console.error('SERVER ERROR:', err);
});

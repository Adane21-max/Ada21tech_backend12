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

    // 🔧 Ensure payments table has the new columns (if table already existed)
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

    // Ensure admin user exists
    await db.query(`
      INSERT INTO users (username, password, role, status) 
      VALUES ('admin', '$2b$10$t1H.F7BUbEVvZIR9FEpfbOYkaFCIcQPet01BMNWpIsr.ljoD6Jiq.', 'admin', 'approved')
      ON DUPLICATE KEY UPDATE password = VALUES(password), role = VALUES(role), status = VALUES(status)
    `);
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

app.use('/api/auth', authRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/free-trial', freeTrialRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/question-types', questionTypeRoutes);
app.use('/api/attempts', attemptRoutes);

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

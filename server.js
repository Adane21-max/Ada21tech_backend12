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

// Safe DB check
db.getConnection()
  .then(conn => {
    console.log('✅ MySQL Connected via pool');
    conn.release();
  })
  .catch(err => {
    console.error('❌ MySQL Connection Failed:', err.message);
    // Don't exit – allow server to start so we can see logs
  });

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
// TEMPORARY DATABASE INITIALIZATION
// =====================
app.get('/api/init-db', async (req, res) => {
  try {
    // Create users table
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role ENUM('admin', 'student') DEFAULT 'student',
        grade INT NULL,
        status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert admin user (password: God@is@love)
    await db.query(`
      INSERT INTO users (username, password, role, status) 
      VALUES ('admin', '$2b$10$t1H.F7BUbEVvZIR9FEpfbOYkaFCIcQPet01BMNWpIsr.ljoD6Jiq.', 'admin', 'approved')
      ON DUPLICATE KEY UPDATE password = VALUES(password), role = VALUES(role), status = VALUES(status)
    `);

    res.json({ message: '✅ users table created and admin inserted' });
  } catch (error) {
    console.error('❌ init-db error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// =====================
// DIAGNOSTIC ROUTE – CRITICAL FOR DEBUGGING
// =====================
app.get('/api/db-info', async (req, res) => {
  try {
    // Get the current database
    const [dbResult] = await db.query('SELECT DATABASE() AS current_db');
    const currentDb = dbResult[0].current_db;

    // Get all databases the user can see
    const [dbs] = await db.query('SHOW DATABASES');
    const databases = dbs.map(row => row.Database);

    res.json({
      currentDatabase: currentDb,
      visibleDatabases: databases
    });
  } catch (error) {
    console.error('❌ DB Info Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

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
  res.json({ message: 'pong', env: !!process.env.JWT_SECRET, db: !!process.env.DB_HOST });
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
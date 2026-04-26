const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));

const db = require('./config/db');

// =====================
// AUTO-INITIALIZE ALL TABLES ON STARTUP
// =====================
async function initializeTables() {
  // ... (keep the entire initializeTables function exactly as you have now) ...
}
initializeTables();

// =====================
// ROUTES (external, all existed before upgrades)
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
// ATTEMPT ROUTES (inline – no file dependency)
// ==========================
const attemptRouter = require('express').Router();
const { authenticate } = require('./middleware/authMiddleware');
const { saveAttempt, getStudentAttempts, getAttemptDetails } = require('./controllers/attemptController');

attemptRouter.post('/', authenticate, saveAttempt);
attemptRouter.get('/', authenticate, getStudentAttempts);
attemptRouter.get('/:id', authenticate, getAttemptDetails);

app.use('/api/attempts', attemptRouter);

// =====================
// HEALTH CHECK
// =====================
app.get('/', (req, res) => res.send('Ada21Tech API is running...'));
app.get('/api/ping', (req, res) => res.json({ message: 'pong', env: !!process.env.JWT_SECRET, db: !!process.env.MYSQLHOST }));

// 404 HANDLER
app.use((req, res) => res.status(404).json({ message: 'Route not found' }));

// START SERVER
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));

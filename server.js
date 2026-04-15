require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static('uploads'));

// DB check (important)
const db = require('./config/db');
db.getConnection()
  .then(conn => {
    console.log('MySQL Connected');
    conn.release();
  })
  .catch(err => {
    console.error('MySQL Connection Failed:', err);
  });

// Routes
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

// Home route
app.get('/', (req, res) => {
  res.send('Ada21Tech API is running...');
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

server.on('error', (err) => {
  console.error('SERVER ERROR:', err);
});
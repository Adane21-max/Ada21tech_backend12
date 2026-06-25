const db = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// --- REGISTER ---
exports.register = async (req, res) => {
  console.log('📝 Register attempt:', { username: req.body.username, grade: req.body.grade });
  try {
    const { username, password, grade } = req.body;

    if (!username || !password || !grade) {
      console.warn('Missing required fields');
      return res.status(400).json({ message: 'Username, passwordconst db = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// --- REGISTER ---
exports.register = async (req, res) => {
  console.log('📝 Register attempt:', { 
    username: req.body.username, 
    grade: req.body.grade,
    first_name: req.body.first_name,
    last_name: req.body.last_name
  });
  try {
    // 🆕 Destructure the new fields
    const { 
      username, 
      password, 
      grade, 
      first_name, 
      middle_name, 
      last_name 
    } = req.body;

    // 🆕 Validate required fields (first_name and last_name added)
    if (!username || !password || !grade || !first_name || !last_name) {
      console.warn('Missing required fields');
      return res.status(400).json({ 
        message: 'Username, password, grade, first name, and last name are required' 
      });
    }

    if (password.length < 4) {
      console.warn('Password too short');
      return res.status(400).json({ message: 'Password must be at least 4 characters' });
    }

    // Check if username already exists
    const [existing] = await db.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length > 0) {
      console.warn('Username already taken:', username);
      return res.status(400).json({ message: 'Username already taken, use another username' });   
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 🆕 Updated INSERT query to include name columns
    await db.query(
      `INSERT INTO users 
       (username, password, role, grade, status, first_name, middle_name, last_name) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        username, 
        hashedPassword, 
        'student', 
        grade, 
        'pending', 
        first_name, 
        middle_name || null,   // middle_name is optional
        last_name
      ]
    );

    console.log('✅ Registration successful:', username);
    res.status(201).json({ message: 'Registration successful. Awaiting admin approval.' });
  } catch (error) {
    console.error('❌ Register Error:');
    console.error('  Message:', error.message);
    console.error('  Code:', error.code);
    console.error('  SQL:', error.sql);
    console.error('  Stack:', error.stack);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

// --- LOGIN (unchanged) ---
exports.login = async (req, res) => {
  console.log('🔐 Login attempt:', req.body.username);
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      console.warn('Missing username or password');
      return res.status(400).json({ message: 'Username and password required' });
    }

    const [rows] = await db.query(
      'SELECT id, username, password, role, grade, status FROM users WHERE username = ?',
      [username]
    );

    if (rows.length === 0) {
      console.warn('User not found:', username);
      return res.status(401).json({ message: 'not_registered' });
    }

    const user = rows[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      console.warn('Invalid password for user:', username);
      return res.status(401).json({ message: 'Invalid password' });
    }

    // Block rejected students
    if (user.role === 'student' && user.status === 'rejected') {
      console.warn('Rejected student login attempt:', username);
      return res.status(403).json({ message: 'Your account has been rejected. Please contact support.' });
    }

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        grade: user.grade
      },
      process.env.JWT_SECRET || 'ada21_secret_key',
      { expiresIn: '7d' }
    );

    console.log('✅ Login successful:', username);
    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        grade: user.grade,
        status: user.status
        // 🆕 You could optionally include first_name, etc. here if needed
      }
    });
  } catch (error) {
    console.error('❌ Login Error:');
    console.error('  Message:', error.message);
    console.error('  Code:', error.code);
    console.error('  SQL:', error.sql);
    console.error('  Stack:', error.stack);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};, and grade are required' });
    }

    if (password.length < 4) {
      console.warn('Password too short');
      return res.status(400).json({ message: 'Password must be at least 4 characters' });
    }

    // Check if username already exists
    const [existing] = await db.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length > 0) {
      console.warn('Username already taken:', username);
      return res.status(400).json({ message: 'Username already taken, use another username' });   
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    await db.query(
      'INSERT INTO users (username, password, role, grade, status) VALUES (?, ?, ?, ?, ?)',
      [username, hashedPassword, 'student', grade, 'pending']
    );

    console.log('✅ Registration successful:', username);
    res.status(201).json({ message: 'Registration successful. Awaiting admin approval.' });
  } catch (error) {
    console.error('❌ Register Error:');
    console.error('  Message:', error.message);
    console.error('  Code:', error.code);
    console.error('  SQL:', error.sql);
    console.error('  Stack:', error.stack);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

// --- LOGIN ---
exports.login = async (req, res) => {
  console.log('🔐 Login attempt:', req.body.username);
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      console.warn('Missing username or password');
      return res.status(400).json({ message: 'Username and password required' });
    }

    const [rows] = await db.query(
      'SELECT id, username, password, role, grade, status FROM users WHERE username = ?',
      [username]
    );

    if (rows.length === 0) {
      console.warn('User not found:', username);
      return res.status(401).json({ message: 'not_registered' });   // 🔁 CHANGED
    }

    const user = rows[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      console.warn('Invalid password for user:', username);
      return res.status(401).json({ message: 'Invalid password' }); // 🔁 CHANGED
    }

    // Block rejected students
    if (user.role === 'student' && user.status === 'rejected') {
      console.warn('Rejected student login attempt:', username);
      return res.status(403).json({ message: 'Your account has been rejected. Please contact support.' });
    }

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        grade: user.grade
      },
      process.env.JWT_SECRET || 'ada21_secret_key',
      { expiresIn: '7d' }
    );

    console.log('✅ Login successful:', username);
    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        grade: user.grade,
        status: user.status
      }
    });
  } catch (error) {
    console.error('❌ Login Error:');
    console.error('  Message:', error.message);
    console.error('  Code:', error.code);
    console.error('  SQL:', error.sql);
    console.error('  Stack:', error.stack);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

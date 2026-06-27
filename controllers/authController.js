const db = require('../config/db');
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
    const {
      username,
      password,
      grade,
      first_name,
      middle_name,
      last_name
    } = req.body;

    // Validate required fields
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

    // Insert with name columns
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
        middle_name || null,   // optional
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
      `SELECT id, username, password, role, grade, status, created_at, permissions 
       FROM users WHERE username = ?`,
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

    if (user.role === 'student' && user.status === 'rejected') {
      console.warn('Rejected student login attempt:', username);
      return res.status(403).json({ message: 'Your account has been rejected. Please contact support.' });
    }

    // ✅ SAFELY parse permissions
    let permissions = [];
    if (user.permissions) {
      try {
        const parsed = JSON.parse(user.permissions);
        if (Array.isArray(parsed)) permissions = parsed;
      } catch (e) {
        // Invalid JSON – treat as empty array
        permissions = [];
      }
    }

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        grade: user.grade,
        permissions: permissions
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
        status: user.status,
        created_at: user.created_at,
        permissions: permissions
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

// ============================================================
// Staff Management Functions
// ============================================================

// Register a new staff user (admin only)
exports.registerStaff = async (req, res) => {
  try {
    // Only admins (or users with manage_staff permission) can create staff
    if (req.user.role !== 'admin' && !req.user.permissions?.includes('manage_staff')) {
      return res.status(403).json({ message: 'Access denied. Only admins or managers can create staff.' });
    }

    const { username, password, permissions } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    // Check if username already exists
    const [existing] = await db.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length > 0) {
      return res.status(400).json({ message: 'Username already taken' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insert staff with role = 'staff' and permissions as JSON
    await db.query(
      'INSERT INTO users (username, password, role, permissions) VALUES (?, ?, ?, ?)',
      [username, hashedPassword, 'staff', JSON.stringify(permissions || [])]
    );

    console.log(`✅ Staff created: ${username}`);
    res.status(201).json({ message: 'Staff account created successfully', username });
  } catch (err) {
    console.error('❌ Register staff error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all staff users (admin or manager only)
exports.getStaffList = async (req, res) => {
  try {
    if (req.user.role !== 'admin' && !req.user.permissions?.includes('manage_staff')) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const [rows] = await db.query(
      'SELECT id, username, role, permissions, created_at FROM users WHERE role = ? ORDER BY created_at DESC',
      ['staff']
    );

    const staff = rows.map(row => {
      let perms = [];
      if (row.permissions) {
        try {
          const parsed = JSON.parse(row.permissions);
          if (Array.isArray(parsed)) {
            perms = parsed;
          } else if (typeof parsed === 'string') {
            perms = [parsed];
          }
        } catch (e) {
          // Not valid JSON – treat as plain string
          if (typeof row.permissions === 'string') {
            if (row.permissions.includes(',')) {
              perms = row.permissions.split(',').map(s => s.trim());
            } else {
              perms = [row.permissions.trim()];
            }
          }
        }
      }
      return {
        ...row,
        permissions: perms
      };
    });
    res.json(staff);
  } catch (err) {
    console.error('❌ Get staff list error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update staff permissions (admin or manager only)
exports.updateStaffPermissions = async (req, res) => {
  try {
    if (req.user.role !== 'admin' && !req.user.permissions?.includes('manage_staff')) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { id } = req.params;
    const { permissions } = req.body;

    if (!permissions || !Array.isArray(permissions)) {
      return res.status(400).json({ message: 'Permissions must be an array' });
    }

    // ✅ Use parameterized query – no double quotes
    await db.query(
      'UPDATE users SET permissions = ? WHERE id = ? AND role = ?',
      [JSON.stringify(permissions), id, 'staff']
    );

    res.json({ message: 'Permissions updated successfully' });
  } catch (err) {
    console.error('❌ Update staff permissions error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

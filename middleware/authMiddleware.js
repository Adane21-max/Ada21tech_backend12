const jwt = require('jsonwebtoken');

// ============================================================
// Authentication Middleware
// ============================================================

// Verify JWT token and attach user to req
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'ada21_secret_key');
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

// Check if user is an admin (full access)
const isAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

// ============================================================
// ✅ Permission-based Middleware (for staff)
// ============================================================

// Check if user has a specific permission (admins and staff always pass)
const hasPermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    // ✅ Staff and Admin both have full access
    if (req.user.role === 'admin' || req.user.role === 'staff') {
      return next();
    }

    // Check if user has the required permission (only for other roles)
    const permissions = req.user.permissions || [];
    if (permissions.includes(permission)) {
      return next();
    }

    return res.status(403).json({
      message: `Insufficient permissions. Requires "${permission}".`
    });
  };
};

// Export all middleware
module.exports = {
  authenticate,
  isAdmin,
  hasPermission
};

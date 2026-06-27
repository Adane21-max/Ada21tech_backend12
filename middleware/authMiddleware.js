const jwt = require('jsonwebtoken');

// ============================================================
// Authentication Middleware
// ============================================================

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

// ✅ Allow BOTH admin and staff
const isAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  if (req.user.role !== 'admin' && req.user.role !== 'staff') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

// Staff and Admin bypass permission checks
const hasPermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }
    if (req.user.role === 'admin' || req.user.role === 'staff') {
      return next();
    }
    const permissions = req.user.permissions || [];
    if (permissions.includes(permission)) {
      return next();
    }
    return res.status(403).json({
      message: `Insufficient permissions. Requires "${permission}".`
    });
  };
};

module.exports = {
  authenticate,
  isAdmin,
  hasPermission
};

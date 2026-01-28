const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    // Also check cookies
    const cookieToken = req.cookies?.token;
    if (!cookieToken) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }
    req.token = cookieToken;
  } else {
    req.token = token;
  }

  jwt.verify(req.token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
}

function isAdmin(req, res, next) {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function isModerator(req, res, next) {
  if (!req.user || (req.user.role !== 'moderator' && req.user.role !== 'admin')) {
    return res.status(403).json({ error: 'Moderator or admin access required' });
  }
  next();
}

function isAdminOrModerator(req, res, next) {
  if (!req.user || (req.user.role !== 'moderator' && req.user.role !== 'admin')) {
    return res.status(403).json({ error: 'Moderator or admin access required' });
  }
  next();
}

module.exports = {
  authenticateToken,
  isAdmin,
  isModerator,
  isAdminOrModerator
};

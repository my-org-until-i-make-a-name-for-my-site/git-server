const db = require('../database');

// Middleware to check if user is banned
function checkUserBan(req, res, next) {
  if (!req.user) {
    return next();
  }

  db.get(
    'SELECT is_banned, ban_reason FROM users WHERE id = ?',
    [req.user.id],
    (err, user) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to check ban status' });
      }

      if (user && user.is_banned) {
        return res.status(403).json({ 
          error: 'Your account has been banned',
          reason: user.ban_reason
        });
      }

      next();
    }
  );
}

// Middleware to check if IP is banned
function checkIpBan(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;

  db.get(
    `SELECT * FROM ip_bans 
     WHERE ip_address = ? 
     AND (expires_at IS NULL OR expires_at > datetime('now'))`,
    [ip],
    (err, ban) => {
      if (err) {
        console.error('Error checking IP ban:', err);
        return next();
      }

      if (ban) {
        return res.status(403).json({ 
          error: 'Your IP address has been banned',
          reason: ban.reason,
          expires_at: ban.expires_at
        });
      }

      next();
    }
  );
}

// Combined ban check middleware
function checkBans(req, res, next) {
  checkIpBan(req, res, (err) => {
    if (err) return next(err);
    checkUserBan(req, res, next);
  });
}

module.exports = {
  checkUserBan,
  checkIpBan,
  checkBans
};

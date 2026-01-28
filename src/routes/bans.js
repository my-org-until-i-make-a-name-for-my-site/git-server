const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// Get all banned users
router.get('/users', authenticateToken, requireAdmin, (req, res) => {
  db.all(
    `SELECT u.id, u.username, u.email, u.is_banned, u.ban_reason, u.banned_at,
            admin.username as banned_by_username
     FROM users u
     LEFT JOIN users admin ON u.banned_by = admin.id
     WHERE u.is_banned = 1
     ORDER BY u.banned_at DESC`,
    (err, users) => {
      if (err) {
        console.error('Error fetching banned users:', err);
        return res.status(500).json({ error: 'Failed to fetch banned users' });
      }

      res.json({ banned_users: users || [] });
    }
  );
});

// Ban a user
router.post('/users/:username/ban', authenticateToken, requireAdmin, (req, res) => {
  const { username } = req.params;
  const { reason } = req.body;

  if (username === req.user.username) {
    return res.status(400).json({ error: 'You cannot ban yourself' });
  }

  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.role === 'admin') {
      return res.status(403).json({ error: 'Cannot ban admin users' });
    }

    db.run(
      `UPDATE users 
       SET is_banned = 1, ban_reason = ?, banned_at = datetime('now'), banned_by = ?
       WHERE username = ?`,
      [reason || 'No reason provided', req.user.id, username],
      function(err) {
        if (err) {
          console.error('Error banning user:', err);
          return res.status(500).json({ error: 'Failed to ban user' });
        }

        // Record in ban history
        db.run(
          `INSERT INTO ban_history (user_id, action, reason, performed_by)
           VALUES (?, 'ban', ?, ?)`,
          [user.id, reason, req.user.id]
        );

        res.json({ 
          message: `User ${username} has been banned`,
          reason: reason || 'No reason provided'
        });
      }
    );
  });
});

// Unban a user
router.post('/users/:username/unban', authenticateToken, requireAdmin, (req, res) => {
  const { username } = req.params;

  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    db.run(
      `UPDATE users 
       SET is_banned = 0, ban_reason = NULL, banned_at = NULL, banned_by = NULL
       WHERE username = ?`,
      [username],
      function(err) {
        if (err) {
          console.error('Error unbanning user:', err);
          return res.status(500).json({ error: 'Failed to unban user' });
        }

        // Record in ban history
        db.run(
          `INSERT INTO ban_history (user_id, action, reason, performed_by)
           VALUES (?, 'unban', 'Unbanned by admin', ?)`,
          [user.id, req.user.id]
        );

        res.json({ message: `User ${username} has been unbanned` });
      }
    );
  });
});

// Get all IP bans
router.get('/ips', authenticateToken, requireAdmin, (req, res) => {
  db.all(
    `SELECT ib.*, u.username as banned_by_username
     FROM ip_bans ib
     JOIN users u ON ib.banned_by = u.id
     WHERE ib.expires_at IS NULL OR ib.expires_at > datetime('now')
     ORDER BY ib.banned_at DESC`,
    (err, bans) => {
      if (err) {
        console.error('Error fetching IP bans:', err);
        return res.status(500).json({ error: 'Failed to fetch IP bans' });
      }

      res.json({ ip_bans: bans || [] });
    }
  );
});

// Ban an IP address
router.post('/ips/ban', authenticateToken, requireAdmin, (req, res) => {
  const { ip_address, reason, duration } = req.body;

  if (!ip_address) {
    return res.status(400).json({ error: 'IP address is required' });
  }

  // Calculate expiration if duration is provided (in days)
  let expires_at = null;
  if (duration && duration > 0) {
    expires_at = `datetime('now', '+${duration} days')`;
  }

  const query = expires_at 
    ? `INSERT OR REPLACE INTO ip_bans (ip_address, reason, banned_by, expires_at)
       VALUES (?, ?, ?, ${expires_at})`
    : `INSERT OR REPLACE INTO ip_bans (ip_address, reason, banned_by)
       VALUES (?, ?, ?)`;

  db.run(
    query,
    [ip_address, reason || 'No reason provided', req.user.id],
    function(err) {
      if (err) {
        console.error('Error banning IP:', err);
        return res.status(500).json({ error: 'Failed to ban IP address' });
      }

      // Record in ban history
      db.run(
        `INSERT INTO ban_history (ip_address, action, reason, performed_by)
         VALUES (?, 'ip_ban', ?, ?)`,
        [ip_address, reason, req.user.id]
      );

      res.json({ 
        message: `IP address ${ip_address} has been banned`,
        reason: reason || 'No reason provided',
        duration: duration ? `${duration} days` : 'permanent'
      });
    }
  );
});

// Unban an IP address
router.delete('/ips/:ip', authenticateToken, requireAdmin, (req, res) => {
  const ip_address = decodeURIComponent(req.params.ip);

  db.run(
    'DELETE FROM ip_bans WHERE ip_address = ?',
    [ip_address],
    function(err) {
      if (err) {
        console.error('Error unbanning IP:', err);
        return res.status(500).json({ error: 'Failed to unban IP address' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'IP address not found in ban list' });
      }

      // Record in ban history
      db.run(
        `INSERT INTO ban_history (ip_address, action, reason, performed_by)
         VALUES (?, 'ip_unban', 'Unbanned by admin', ?)`,
        [ip_address, req.user.id]
      );

      res.json({ message: `IP address ${ip_address} has been unbanned` });
    }
  );
});

// Get ban history
router.get('/history', authenticateToken, requireAdmin, (req, res) => {
  const { limit = 50, offset = 0 } = req.query;

  db.all(
    `SELECT bh.*, 
            u.username as target_username,
            admin.username as performed_by_username
     FROM ban_history bh
     LEFT JOIN users u ON bh.user_id = u.id
     JOIN users admin ON bh.performed_by = admin.id
     ORDER BY bh.performed_at DESC
     LIMIT ? OFFSET ?`,
    [parseInt(limit), parseInt(offset)],
    (err, history) => {
      if (err) {
        console.error('Error fetching ban history:', err);
        return res.status(500).json({ error: 'Failed to fetch ban history' });
      }

      res.json({ history: history || [] });
    }
  );
});

// Check if IP is banned (public endpoint for testing)
router.get('/check-ip', (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;

  db.get(
    `SELECT * FROM ip_bans 
     WHERE ip_address = ? 
     AND (expires_at IS NULL OR expires_at > datetime('now'))`,
    [ip],
    (err, ban) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to check IP ban status' });
      }

      res.json({ 
        ip_address: ip,
        is_banned: !!ban,
        ban_info: ban || null
      });
    }
  );
});

module.exports = router;

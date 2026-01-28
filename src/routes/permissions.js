const express = require('express');
const db = require('../database');
const { authenticateToken, isAdmin } = require('../middleware/auth');

const router = express.Router();

// Grant high power cluster access to user (admin only)
router.post('/users/:username/grant-high-power', authenticateToken, isAdmin, (req, res) => {
  const { username } = req.params;

  db.run(
    'UPDATE users SET can_use_high_power_clusters = 1 WHERE username = ?',
    [username],
    function (err) {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({ message: `High power cluster access granted to ${username}` });
    }
  );
});

// Revoke high power cluster access from user (admin only)
router.post('/users/:username/revoke-high-power', authenticateToken, isAdmin, (req, res) => {
  const { username } = req.params;

  db.run(
    'UPDATE users SET can_use_high_power_clusters = 0 WHERE username = ?',
    [username],
    function (err) {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({ message: `High power cluster access revoked from ${username}` });
    }
  );
});

// Grant high power cluster access to organization (admin only)
router.post('/organizations/:name/grant-high-power', authenticateToken, isAdmin, (req, res) => {
  const { name } = req.params;

  db.run(
    'UPDATE organizations SET can_use_high_power_clusters = 1 WHERE name = ?',
    [name],
    function (err) {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      res.json({ message: `High power cluster access granted to organization ${name}` });
    }
  );
});

// Revoke high power cluster access from organization (admin only)
router.post('/organizations/:name/revoke-high-power', authenticateToken, isAdmin, (req, res) => {
  const { name } = req.params;

  db.run(
    'UPDATE organizations SET can_use_high_power_clusters = 0 WHERE name = ?',
    [name],
    function (err) {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      res.json({ message: `High power cluster access revoked from organization ${name}` });
    }
  );
});

// Check if user can use high power clusters
router.get('/check-high-power/:username', authenticateToken, (req, res) => {
  const { username } = req.params;

  db.get(
    'SELECT can_use_high_power_clusters FROM users WHERE username = ?',
    [username],
    (err, user) => {
      if (err || !user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({ 
        username,
        canUseHighPowerClusters: user.can_use_high_power_clusters === 1 
      });
    }
  );
});

module.exports = router;

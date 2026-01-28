const express = require('express');
const db = require('../database');
const { authenticateToken, isModerator, isAdminOrModerator } = require('../middleware/auth');

const router = express.Router();

// Moderators can view basic user list (limited info)
router.get('/users', authenticateToken, isModerator, (req, res) => {
  db.all(
    'SELECT id, username, email, role, created_at FROM users WHERE role != ?',
    ['admin'], // Moderators cannot see admin users
    (err, users) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ users });
    }
  );
});

// Moderators can view public repositories
router.get('/repositories', authenticateToken, isModerator, (req, res) => {
  db.all(
    `SELECT r.id, r.name, r.description, r.owner_type, r.created_at,
     CASE 
       WHEN r.owner_type = 'user' THEN (SELECT username FROM users WHERE id = r.owner_id)
       WHEN r.owner_type = 'org' THEN (SELECT name FROM organizations WHERE id = r.owner_id)
     END as owner_name
     FROM repositories r
     WHERE r.is_private = 0
     ORDER BY r.created_at DESC`,
    [],
    (err, repos) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ repositories: repos });
    }
  );
});

// Moderators can view basic platform stats (limited)
router.get('/stats', authenticateToken, isModerator, (req, res) => {
  const stats = {};

  db.get('SELECT COUNT(*) as count FROM users WHERE role != ?', ['admin'], (err, users) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    stats.userCount = users.count;

    db.get('SELECT COUNT(*) as count FROM repositories WHERE is_private = 0', [], (err, repos) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      stats.publicRepoCount = repos.count;

      db.get('SELECT COUNT(*) as count FROM organizations', [], (err, orgs) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        stats.orgCount = orgs.count;

        res.json({ stats });
      });
    });
  });
});

// Moderators can view reports of flagged content (placeholder for future feature)
router.get('/reports', authenticateToken, isModerator, (req, res) => {
  // Placeholder - would show flagged repos, users, etc.
  res.json({ reports: [], message: 'Report system not yet implemented' });
});

module.exports = router;

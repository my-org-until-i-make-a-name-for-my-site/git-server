const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const db = require('../database');

// Search endpoint
router.get('/', authenticateToken, async (req, res) => {
  const { q, type = 'all' } = req.query;

  if (!q || q.length < 2) {
    return res.json({ repos: [], orgs: [], users: [] });
  }

  const searchTerm = `%${q}%`;
  const results = { repos: [], orgs: [], users: [] };

  try {
    // Search repositories
    if (type === 'all' || type === 'repos') {
      const repos = db.prepare(`
        SELECT r.*, u.username as owner 
        FROM repositories r
        JOIN users u ON r.owner_id = u.id
        WHERE r.name LIKE ? OR r.description LIKE ?
        LIMIT 20
      `).all(searchTerm, searchTerm);
      results.repos = repos;
    }

    // Search organizations
    if (type === 'all' || type === 'orgs') {
      const orgs = db.prepare(`
        SELECT * FROM organizations
        WHERE name LIKE ? OR display_name LIKE ?
        LIMIT 20
      `).all(searchTerm, searchTerm);
      results.orgs = orgs;
    }

    // Search users
    if (type === 'all' || type === 'users') {
      const users = db.prepare(`
        SELECT id, username, email, created_at 
        FROM users
        WHERE username LIKE ? OR email LIKE ?
        LIMIT 20
      `).all(searchTerm, searchTerm);
      results.users = users;
    }

    res.json(results);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

module.exports = router;

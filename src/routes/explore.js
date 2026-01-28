const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const db = require('../database');

// Get explore/trending data
router.get('/', authenticateToken, async (req, res) => {
  try {
    // Get recent repositories (last 30 days, most recent first)
    const recent = db.prepare(`
      SELECT r.*, u.username as owner, 0 as stars, 0 as forks
      FROM repositories r
      JOIN users u ON r.owner_id = u.id
      WHERE r.created_at > datetime('now', '-30 days')
      ORDER BY r.created_at DESC
      LIMIT 12
    `).all();

    // For trending, we'll use most recently updated repos
    // In a real implementation, you'd track stars, forks, etc.
    const trending = db.prepare(`
      SELECT r.*, u.username as owner, 0 as stars, 0 as forks
      FROM repositories r
      JOIN users u ON r.owner_id = u.id
      ORDER BY r.updated_at DESC
      LIMIT 12
    `).all();

    res.json({ trending, recent });
  } catch (error) {
    console.error('Explore error:', error);
    res.status(500).json({ error: 'Failed to load explore data' });
  }
});

module.exports = router;

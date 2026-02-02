const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const db = require('../database');

// Get explore/trending data
router.get('/', authenticateToken, (req, res) => {
    let completed = 0;
    const results = { trending: [], recent: [] };

    // Get recent repositories (last 30 days, most recent first)
    db.all(`
    SELECT r.id, r.name, r.description, r.owner_type, r.owner_id, r.path, r.is_private, r.created_at, r.updated_at, u.username as owner, 0 as stars, 0 as forks
    FROM repositories r
    JOIN users u ON r.owner_id = u.id
    WHERE r.created_at > datetime('now', '-30 days')
    ORDER BY r.created_at DESC
    LIMIT 12
  `, (err, rows) => {
        if (err) {
            console.error('Recent repos error:', err);
        } else {
            results.recent = rows || [];
        }
        completed++;
        if (completed === 2) {
            res.json(results);
        }
    });

    db.all(`
    SELECT r.id, r.name, r.description, r.owner_type, r.owner_id, r.path, r.is_private, r.created_at, r.updated_at, u.username as owner, 0 as stars, 0 as forks
    FROM repositories r
    JOIN users u ON r.owner_id = u.id
    ORDER BY r.updated_at DESC
    LIMIT 12
  `, (err, rows) => {
        if (err) {
            console.error('Trending repos error:', err);
        } else {
            results.trending = rows || [];
        }
        completed++;
        if (completed === 2) {
            res.json(results);
        }
    });
});

module.exports = router;
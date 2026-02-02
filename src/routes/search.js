const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const db = require('../database');

// Search endpoint
router.get('/', authenticateToken, (req, res) => {
    const { q, type = 'all' } = req.query;

    if (!q || q.length < 2) {
        return res.json({ repos: [], orgs: [], users: [] });
    }

    const searchTerm = `%${q}%`;
    const results = { repos: [], orgs: [], users: [] };
    let completed = 0;
    let hasError = false;

    // Search repositories
    if (type === 'all' || type === 'repos') {
        db.all(`
      SELECT r.*, u.username as owner 
      FROM repositories r
      JOIN users u ON r.owner_id = u.id
      WHERE r.name LIKE ? OR r.description LIKE ?
      LIMIT 20
    `, [searchTerm, searchTerm], (err, rows) => {
            if (err) {
                console.error('Repository search error:', err);
                hasError = true;
            } else {
                results.repos = rows || [];
            }
            completed++;
            if (completed === (type === 'all' ? 3 : 1) && !hasError) {
                res.json(results);
            }
        });
    }

    // Search organizations
    if (type === 'all' || type === 'orgs') {
        db.all(`
      SELECT * FROM organizations
      WHERE name LIKE ? OR display_name LIKE ?
      LIMIT 20
    `, [searchTerm, searchTerm], (err, rows) => {
            if (err) {
                console.error('Organization search error:', err);
                hasError = true;
            } else {
                results.orgs = rows || [];
            }
            completed++;
            if (completed === (type === 'all' ? 3 : 1) && !hasError) {
                res.json(results);
            }
        });
    }

    // Search users
    if (type === 'all' || type === 'users') {
        db.all(`
      SELECT id, username, email, created_at 
      FROM users
      WHERE username LIKE ? OR email LIKE ?
      LIMIT 20
    `, [searchTerm, searchTerm], (err, rows) => {
            if (err) {
                console.error('User search error:', err);
                hasError = true;
            } else {
                results.users = rows || [];
            }
            completed++;
            if (completed === (type === 'all' ? 3 : 1) && !hasError) {
                res.json(results);
            }
        });
    }
});

module.exports = router;

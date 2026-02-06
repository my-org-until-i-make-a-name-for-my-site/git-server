const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const db = require('../database');

let searchIndexer = null;

function setSearchIndexer(indexer) {
    searchIndexer = indexer;
}

// Search endpoint
router.get('/', authenticateToken, (req, res) => {
    const { q, type = 'all' } = req.query;

    if (!q || q.length < 2) {
        return res.json({ repos: [], orgs: [], users: [] });
    }

    const searchTerm = `%${q}%`;

    // Prefer indexer for repo search
    if (searchIndexer && searchIndexer.ready && (type === 'all' || type === 'repos')) {
        const repoMatches = searchIndexer.search(q);
        const limited = repoMatches.slice(0, 20);
        const results = {
            repos: limited,
            orgs: [],
            users: []
        };

        if (type === 'all') {
            // fall back to DB for orgs/users to keep existing behavior
            let completed = 0;
            let hasError = false;

            const done = () => {
                completed++;
                if (completed === 2) {
                    if (hasError) {
                        return res.status(500).json({ error: 'Search failed', repos: results.repos });
                    }
                    return res.json(results);
                }
            };

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
                done();
            });

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
                done();
            });
            return;
        }

        return res.json(results);
    }

    const searchTerm = `%${q}%`;
    const results = { repos: [], orgs: [], users: [] };
    let completed = 0;
    let hasError = false;
    const needed = type === 'all' ? 3 : 1;
    const finish = () => {
        if (completed === needed) {
            if (hasError) {
                return res.status(500).json({ error: 'Search failed', ...results });
            }
            return res.json(results);
        }
    };

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
            finish();
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
            finish();
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
            finish();
        });
    }
});

module.exports = router;
module.exports.setSearchIndexer = setSearchIndexer;

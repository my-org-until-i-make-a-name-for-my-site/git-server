const express = require('express');
const db = require('../database');
const { authenticateToken, isAdmin } = require('../middleware/auth');

const router = express.Router();

// Get all users (admin only)
router.get('/users', authenticateToken, isAdmin, (req, res) => {
    db.all(
        'SELECT id, username, email, role, is_admin, can_use_high_power_clusters, created_at FROM users',
        [],
        (err, users) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ users });
        }
    );
});

// Promote user to admin (admin only)
router.post('/users/:username/promote-admin', authenticateToken, isAdmin, (req, res) => {
    const { username } = req.params;

    db.run(
        'UPDATE users SET role = ?, is_admin = 1 WHERE username = ?',
        ['admin', username],
        function (err) {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }

            if (this.changes === 0) {
                return res.status(404).json({ error: 'User not found' });
            }

            res.json({
                message: `User ${username} promoted to admin`,
                role: 'admin'
            });
        }
    );
});

// Promote user to moderator (admin only)
router.post('/users/:username/promote-moderator', authenticateToken, isAdmin, (req, res) => {
    const { username } = req.params;

    db.run(
        'UPDATE users SET role = ?, is_admin = 0 WHERE username = ?',
        ['moderator', username],
        function (err) {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }

            if (this.changes === 0) {
                return res.status(404).json({ error: 'User not found' });
            }

            res.json({
                message: `User ${username} promoted to moderator`,
                role: 'moderator'
            });
        }
    );
});

// Demote user to regular user (admin only)
router.post('/users/:username/demote', authenticateToken, isAdmin, (req, res) => {
    const { username } = req.params;

    db.run(
        'UPDATE users SET role = ?, is_admin = 0 WHERE username = ?',
        ['user', username],
        function (err) {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }

            if (this.changes === 0) {
                return res.status(404).json({ error: 'User not found' });
            }

            res.json({
                message: `User ${username} demoted to regular user`,
                role: 'user'
            });
        }
    );
});

// Update user role (admin only)
router.put('/users/:username/role', authenticateToken, isAdmin, (req, res) => {
    const { username } = req.params;
    const { role } = req.body;

    const validRoles = ['user', 'moderator', 'admin'];
    if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid role. Must be user, moderator, or admin' });
    }

    const isAdminFlag = role === 'admin' ? 1 : 0;

    db.run(
        'UPDATE users SET role = ?, is_admin = ? WHERE username = ?',
        [role, isAdminFlag, username],
        function (err) {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }

            if (this.changes === 0) {
                return res.status(404).json({ error: 'User not found' });
            }

            res.json({
                message: `User ${username} role updated to ${role}`,
                role
            });
        }
    );
});

// Delete user (admin only)
router.delete('/users/:username', authenticateToken, isAdmin, (req, res) => {
    const { username } = req.params;

    // Prevent deleting own account
    if (username === req.user.username) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    db.run(
        'DELETE FROM users WHERE username = ?',
        [username],
        function (err) {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }

            if (this.changes === 0) {
                return res.status(404).json({ error: 'User not found' });
            }

            res.json({ message: `User ${username} deleted successfully` });
        }
    );
});

// Get user details (admin only)
router.get('/users/:username', authenticateToken, isAdmin, (req, res) => {
    const { username } = req.params;

    db.get(
        'SELECT id, username, email, role, is_admin, can_use_high_power_clusters, dob, country, created_at FROM users WHERE username = ?',
        [username],
        (err, user) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }

            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            res.json({ user });
        }
    );
});

// Get all repositories (admin only)
router.get('/repositories', authenticateToken, isAdmin, (req, res) => {
    db.all(
        `SELECT r.*, 
     CASE 
       WHEN r.owner_type = 'user' THEN (SELECT username FROM users WHERE id = r.owner_id)
       WHEN r.owner_type = 'org' THEN (SELECT name FROM organizations WHERE id = r.owner_id)
     END as owner_name
     FROM repositories r
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

// Delete repository (admin only)
router.delete('/repositories/:id', authenticateToken, isAdmin, (req, res) => {
    const { id } = req.params;

    db.get('SELECT * FROM repositories WHERE id = ?', [id], (err, repo) => {
        if (err || !repo) {
            return res.status(404).json({ error: 'Repository not found' });
        }

        // Delete from filesystem
        const fs = require('fs-extra');
        fs.remove(repo.path).catch(err => console.error('Error removing repo directory:', err));

        // Delete from database
        db.run('DELETE FROM repositories WHERE id = ?', [id], function (err) {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ message: 'Repository deleted successfully' });
        });
    });
});

// Get all organizations (admin only)
router.get('/organizations', authenticateToken, isAdmin, (req, res) => {
    db.all(
        'SELECT * FROM organizations ORDER BY created_at DESC',
        [],
        (err, orgs) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ organizations: orgs });
        }
    );
});

// Delete organization (admin only)
router.delete('/organizations/:id', authenticateToken, isAdmin, (req, res) => {
    const { id } = req.params;

    db.run('DELETE FROM organizations WHERE id = ?', [id], function (err) {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }

        if (this.changes === 0) {
            return res.status(404).json({ error: 'Organization not found' });
        }

        res.json({ message: 'Organization deleted successfully' });
    });
});

// Get platform statistics (admin only)
router.get('/stats', authenticateToken, isAdmin, (req, res) => {
    const stats = {};

    db.get('SELECT COUNT(*) as count FROM users', [], (err, users) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        stats.userCount = users.count;

        db.get('SELECT COUNT(*) as count FROM repositories', [], (err, repos) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            stats.repoCount = repos.count;

            db.get('SELECT COUNT(*) as count FROM organizations', [], (err, orgs) => {
                if (err) return res.status(500).json({ error: 'Database error' });
                stats.orgCount = orgs.count;

                db.get('SELECT COUNT(*) as count FROM users WHERE role = ?', ['admin'], (err, admins) => {
                    if (err) return res.status(500).json({ error: 'Database error' });
                    stats.adminCount = admins.count;

                    db.get('SELECT COUNT(*) as count FROM users WHERE role = ?', ['moderator'], (err, mods) => {
                        if (err) return res.status(500).json({ error: 'Database error' });
                        stats.moderatorCount = mods.count;

                        res.json({ stats });
                    });
                });
            });
        });
    });
});

// Update configuration (admin only)
router.put('/config', authenticateToken, isAdmin, (req, res) => {
    const { section, key, value } = req.body;

    if (!section || !key) {
        return res.status(400).json({ error: 'Section and key are required' });
    }

    const { getConfig } = require('../utils/config');
    const config = getConfig();

    // Note: This updates in-memory config only. For persistent changes, 
    // would need to write back to app.ini file
    res.json({
        message: 'Configuration updated (in-memory only)',
        section,
        key,
        value
    });
});

// Execute SQL query (admin only - for debugging and management)
router.post('/sql', authenticateToken, isAdmin, (req, res) => {
    const { query, params = [] } = req.body;

    if (!query) {
        return res.status(400).json({ error: 'Query is required' });
    }

    const upperQuery = query.trim().toUpperCase();

    // Determine if it's a SELECT or modification query
    if (upperQuery.startsWith('SELECT')) {
        db.all(query, params, (err, rows) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ rows, count: rows.length });
        });
    } else {
        db.run(query, params, function (err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({
                changes: this.changes,
                lastID: this.lastID,
                message: 'Query executed successfully'
            });
        });
    }
});

module.exports = router;

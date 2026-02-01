const express = require('express');
const db = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get user settings
router.get('/', authenticateToken, (req, res) => {
    const userId = req.user.id;

    db.get(
        'SELECT * FROM user_settings WHERE user_id = ?',
        [userId],
        (err, settings) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to load settings' });
            }

            if (!settings) {
                // Create default settings if they don't exist
                db.run(
                    'INSERT INTO user_settings (user_id) VALUES (?)',
                    [userId],
                    function (err) {
                        if (err) {
                            return res.status(500).json({ error: 'Failed to create settings' });
                        }
                        res.json({
                            ai_usage: 0,
                            email_notifications: true,
                            theme_preference: 'dark'
                        });
                    }
                );
            } else {
                res.json({
                    ai_usage: settings.ai_usage || 0,
                    email_notifications: Boolean(settings.email_notifications),
                    theme_preference: settings.theme_preference || 'dark'
                });
            }
        }
    );
});

// Update user settings
router.put('/', authenticateToken, (req, res) => {
    const userId = req.user.id;
    const { email_notifications, theme_preference } = req.body;

    db.run(
        `UPDATE user_settings 
     SET email_notifications = ?, theme_preference = ?, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ?`,
        [email_notifications ? 1 : 0, theme_preference, userId],
        function (err) {
            if (err) {
                return res.status(500).json({ error: 'Failed to update settings' });
            }

            if (this.changes === 0) {
                // Insert if not exists
                db.run(
                    `INSERT INTO user_settings (user_id, email_notifications, theme_preference) 
           VALUES (?, ?, ?)`,
                    [userId, email_notifications ? 1 : 0, theme_preference],
                    function (err) {
                        if (err) {
                            return res.status(500).json({ error: 'Failed to create settings' });
                        }
                        res.json({ message: 'Settings saved' });
                    }
                );
            } else {
                res.json({ message: 'Settings saved' });
            }
        }
    );
});

// Get AI usage
router.get('/usage', authenticateToken, (req, res) => {
    const userId = req.user.id;

    db.get(
        'SELECT ai_usage FROM user_settings WHERE user_id = ?',
        [userId],
        (err, row) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to load usage' });
            }
            res.json({ ai_usage: row?.ai_usage || 0 });
        }
    );
});

// Update AI usage
router.post('/usage', authenticateToken, (req, res) => {
    const userId = req.user.id;
    const { usage } = req.body;

    db.run(
        `UPDATE user_settings 
     SET ai_usage = ai_usage + ?, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ?`,
        [usage, userId],
        function (err) {
            if (err) {
                return res.status(500).json({ error: 'Failed to update usage' });
            }

            if (this.changes === 0) {
                // Insert if not exists
                db.run(
                    `INSERT INTO user_settings (user_id, ai_usage) VALUES (?, ?)`,
                    [userId, usage],
                    function (err) {
                        if (err) {
                            return res.status(500).json({ error: 'Failed to create settings' });
                        }
                        res.json({ message: 'Usage updated' });
                    }
                );
            } else {
                res.json({ message: 'Usage updated' });
            }
        }
    );
});

module.exports = router;

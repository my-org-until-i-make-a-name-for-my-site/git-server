const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const db = require('../database');

// Ensure notifications table exists
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `);
} catch (err) {
  console.error('Failed to create notifications table:', err);
}

// Get user notifications
router.get('/', authenticateToken, async (req, res) => {
  try {
    const notifications = db.prepare(`
      SELECT * FROM notifications
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).all(req.user.id);

    res.json({ notifications });
  } catch (error) {
    console.error('Notifications error:', error);
    res.status(500).json({ error: 'Failed to load notifications' });
  }
});

// Mark notification as read
router.post('/:id/read', authenticateToken, async (req, res) => {
  try {
    db.prepare(`
      UPDATE notifications
      SET read = 1
      WHERE id = ? AND user_id = ?
    `).run(req.params.id, req.user.id);

    res.json({ success: true });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// Mark all notifications as read
router.post('/read-all', authenticateToken, async (req, res) => {
  try {
    db.prepare(`
      UPDATE notifications
      SET read = 1
      WHERE user_id = ?
    `).run(req.user.id);

    res.json({ success: true });
  } catch (error) {
    console.error('Mark all read error:', error);
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

// Helper function to create notification
function createNotification(userId, type, title, body) {
  try {
    db.prepare(`
      INSERT INTO notifications (user_id, type, title, body)
      VALUES (?, ?, ?, ?)
    `).run(userId, type, title, body);
  } catch (err) {
    console.error('Failed to create notification:', err);
  }
}

module.exports = router;
module.exports.createNotification = createNotification;

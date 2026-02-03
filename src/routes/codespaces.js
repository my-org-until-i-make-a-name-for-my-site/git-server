const express = require('express');
const db = require('../database');
const { authenticateToken } = require('../middleware/auth');
const createRateLimiter = require('../utils/rate-limit');

const router = express.Router();
const codespacesLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: 'Too many codespace requests, please try again later.'
});

router.use('/codespaces', codespacesLimiter);

router.get('/codespaces', authenticateToken, (req, res) => {
  db.all(
    'SELECT id, name, updated_at, created_at FROM codespaces WHERE user_id = ? ORDER BY updated_at DESC',
    [req.user.id],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to load codespaces' });
      }
      res.json({ codespaces: rows || [] });
    }
  );
});

router.post('/codespaces', authenticateToken, (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Codespace name is required' });
  }

  db.run(
    `INSERT OR IGNORE INTO codespaces (user_id, name, content)
     VALUES (?, ?, '')`,
    [req.user.id, name],
    function (err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to create codespace' });
      }
      if (this.changes === 0) {
        return res.status(400).json({ error: 'Codespace already exists' });
      }
      res.json({ message: 'Codespace created', id: this.lastID, name });
    }
  );
});

router.get('/codespaces/:name', authenticateToken, (req, res) => {
  const { name } = req.params;
  db.get(
    'SELECT id, name, content, updated_at FROM codespaces WHERE user_id = ? AND name = ?',
    [req.user.id, name],
    (err, row) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to load codespace' });
      }
      if (!row) {
        return res.status(404).json({ error: 'Codespace not found' });
      }
      res.json({ codespace: row });
    }
  );
});

router.put('/codespaces/:name', authenticateToken, (req, res) => {
  const { name } = req.params;
  const { content = '' } = req.body;

  db.run(
    `UPDATE codespaces
     SET content = ?, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND name = ?`,
    [content, req.user.id, name],
    function (err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to save codespace' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Codespace not found' });
      }
      res.json({ message: 'Codespace saved' });
    }
  );
});

router.delete('/codespaces/:name', authenticateToken, (req, res) => {
  const { name } = req.params;
  db.run(
    'DELETE FROM codespaces WHERE user_id = ? AND name = ?',
    [req.user.id, name],
    function (err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to delete codespace' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Codespace not found' });
      }
      res.json({ message: 'Codespace deleted' });
    }
  );
});

module.exports = router;

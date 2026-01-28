const express = require('express');
const db = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Create an issue
router.post('/:owner/:repo/issues', authenticateToken, (req, res) => {
  const { owner, repo } = req.params;
  const { title, body, labels } = req.body;
  const authorId = req.user.id;

  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  // Get repository
  db.get(
    `SELECT r.* FROM repositories r
     LEFT JOIN users u ON r.owner_id = u.id AND r.owner_type = 'user'
     LEFT JOIN organizations o ON r.owner_id = o.id AND r.owner_type = 'org'
     WHERE r.name = ? AND (u.username = ? OR o.name = ?)`,
    [repo, owner, owner],
    (err, repository) => {
      if (err || !repository) {
        return res.status(404).json({ error: 'Repository not found' });
      }

      // Get next issue number for this repo
      db.get(
        'SELECT MAX(issue_number) as max_num FROM issues WHERE repo_id = ?',
        [repository.id],
        (err, result) => {
          if (err) {
            return res.status(500).json({ error: 'Database error' });
          }

          const issueNumber = (result.max_num || 0) + 1;

          db.run(
            'INSERT INTO issues (repo_id, issue_number, title, body, author_id) VALUES (?, ?, ?, ?, ?)',
            [repository.id, issueNumber, title, body, authorId],
            function (err) {
              if (err) {
                return res.status(500).json({ error: 'Failed to create issue' });
              }

              const issueId = this.lastID;

              res.json({
                message: 'Issue created successfully',
                issue: {
                  id: issueId,
                  number: issueNumber,
                  title,
                  body,
                  state: 'open',
                  author_id: authorId
                }
              });
            }
          );
        }
      );
    }
  );
});

// Get all issues for a repository
router.get('/:owner/:repo/issues', (req, res) => {
  const { owner, repo } = req.params;
  const { state = 'open', page = 1, per_page = 30 } = req.query;

  // Get repository
  db.get(
    `SELECT r.* FROM repositories r
     LEFT JOIN users u ON r.owner_id = u.id AND r.owner_type = 'user'
     LEFT JOIN organizations o ON r.owner_id = o.id AND r.owner_type = 'org'
     WHERE r.name = ? AND (u.username = ? OR o.name = ?)`,
    [repo, owner, owner],
    (err, repository) => {
      if (err || !repository) {
        return res.status(404).json({ error: 'Repository not found' });
      }

      const offset = (page - 1) * per_page;
      let query = `
        SELECT i.*, u.username as author_name
        FROM issues i
        JOIN users u ON i.author_id = u.id
        WHERE i.repo_id = ?
      `;
      const params = [repository.id];

      if (state !== 'all') {
        query += ' AND i.state = ?';
        params.push(state);
      }

      query += ' ORDER BY i.created_at DESC LIMIT ? OFFSET ?';
      params.push(parseInt(per_page), offset);

      db.all(query, params, (err, issues) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }

        res.json({ issues });
      });
    }
  );
});

// Get a specific issue
router.get('/:owner/:repo/issues/:number', (req, res) => {
  const { owner, repo, number } = req.params;

  db.get(
    `SELECT r.* FROM repositories r
     LEFT JOIN users u ON r.owner_id = u.id AND r.owner_type = 'user'
     LEFT JOIN organizations o ON r.owner_id = o.id AND r.owner_type = 'org'
     WHERE r.name = ? AND (u.username = ? OR o.name = ?)`,
    [repo, owner, owner],
    (err, repository) => {
      if (err || !repository) {
        return res.status(404).json({ error: 'Repository not found' });
      }

      db.get(
        `SELECT i.*, u.username as author_name
         FROM issues i
         JOIN users u ON i.author_id = u.id
         WHERE i.repo_id = ? AND i.issue_number = ?`,
        [repository.id, number],
        (err, issue) => {
          if (err || !issue) {
            return res.status(404).json({ error: 'Issue not found' });
          }

          // Get comments
          db.all(
            `SELECT ic.*, u.username as author_name
             FROM issue_comments ic
             JOIN users u ON ic.author_id = u.id
             WHERE ic.issue_id = ?
             ORDER BY ic.created_at ASC`,
            [issue.id],
            (err, comments) => {
              if (err) {
                return res.status(500).json({ error: 'Database error' });
              }

              res.json({ issue: { ...issue, comments } });
            }
          );
        }
      );
    }
  );
});

// Add comment to issue
router.post('/:owner/:repo/issues/:number/comments', authenticateToken, (req, res) => {
  const { owner, repo, number } = req.params;
  const { body } = req.body;
  const authorId = req.user.id;

  if (!body) {
    return res.status(400).json({ error: 'Comment body is required' });
  }

  db.get(
    `SELECT r.* FROM repositories r
     LEFT JOIN users u ON r.owner_id = u.id AND r.owner_type = 'user'
     LEFT JOIN organizations o ON r.owner_id = o.id AND r.owner_type = 'org'
     WHERE r.name = ? AND (u.username = ? OR o.name = ?)`,
    [repo, owner, owner],
    (err, repository) => {
      if (err || !repository) {
        return res.status(404).json({ error: 'Repository not found' });
      }

      db.get(
        'SELECT id FROM issues WHERE repo_id = ? AND issue_number = ?',
        [repository.id, number],
        (err, issue) => {
          if (err || !issue) {
            return res.status(404).json({ error: 'Issue not found' });
          }

          db.run(
            'INSERT INTO issue_comments (issue_id, author_id, body) VALUES (?, ?, ?)',
            [issue.id, authorId, body],
            function (err) {
              if (err) {
                return res.status(500).json({ error: 'Failed to add comment' });
              }

              res.json({
                message: 'Comment added successfully',
                comment: {
                  id: this.lastID,
                  issue_id: issue.id,
                  author_id: authorId,
                  body
                }
              });
            }
          );
        }
      );
    }
  );
});

// Close issue
router.patch('/:owner/:repo/issues/:number/close', authenticateToken, (req, res) => {
  const { owner, repo, number } = req.params;

  db.get(
    `SELECT r.* FROM repositories r
     LEFT JOIN users u ON r.owner_id = u.id AND r.owner_type = 'user'
     LEFT JOIN organizations o ON r.owner_id = o.id AND r.owner_type = 'org'
     WHERE r.name = ? AND (u.username = ? OR o.name = ?)`,
    [repo, owner, owner],
    (err, repository) => {
      if (err || !repository) {
        return res.status(404).json({ error: 'Repository not found' });
      }

      db.run(
        `UPDATE issues SET state = 'closed', closed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
         WHERE repo_id = ? AND issue_number = ?`,
        [repository.id, number],
        function (err) {
          if (err) {
            return res.status(500).json({ error: 'Database error' });
          }

          if (this.changes === 0) {
            return res.status(404).json({ error: 'Issue not found' });
          }

          res.json({ message: 'Issue closed successfully' });
        }
      );
    }
  );
});

// Reopen issue
router.patch('/:owner/:repo/issues/:number/reopen', authenticateToken, (req, res) => {
  const { owner, repo, number } = req.params;

  db.get(
    `SELECT r.* FROM repositories r
     LEFT JOIN users u ON r.owner_id = u.id AND r.owner_type = 'user'
     LEFT JOIN organizations o ON r.owner_id = o.id AND r.owner_type = 'org'
     WHERE r.name = ? AND (u.username = ? OR o.name = ?)`,
    [repo, owner, owner],
    (err, repository) => {
      if (err || !repository) {
        return res.status(404).json({ error: 'Repository not found' });
      }

      db.run(
        `UPDATE issues SET state = 'open', closed_at = NULL, updated_at = CURRENT_TIMESTAMP 
         WHERE repo_id = ? AND issue_number = ?`,
        [repository.id, number],
        function (err) {
          if (err) {
            return res.status(500).json({ error: 'Database error' });
          }

          if (this.changes === 0) {
            return res.status(404).json({ error: 'Issue not found' });
          }

          res.json({ message: 'Issue reopened successfully' });
        }
      );
    }
  );
});

module.exports = router;

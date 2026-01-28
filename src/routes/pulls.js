const express = require('express');
const db = require('../database');
const { authenticateToken } = require('../middleware/auth');
const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs-extra');

const router = express.Router();
const REPOS_BASE_PATH = process.env.REPOS_BASE_PATH || './repos';

// Create a pull request
router.post('/:owner/:repo/pulls', authenticateToken, async (req, res) => {
  const { owner, repo } = req.params;
  const { title, body, head, base } = req.body;
  const authorId = req.user.id;

  if (!title || !head || !base) {
    return res.status(400).json({ error: 'Title, head branch, and base branch are required' });
  }

  // Get repository
  db.get(
    `SELECT r.* FROM repositories r
     LEFT JOIN users u ON r.owner_id = u.id AND r.owner_type = 'user'
     LEFT JOIN organizations o ON r.owner_id = o.id AND r.owner_type = 'org'
     WHERE r.name = ? AND (u.username = ? OR o.name = ?)`,
    [repo, owner, owner],
    async (err, repository) => {
      if (err || !repository) {
        return res.status(404).json({ error: 'Repository not found' });
      }

      try {
        // Verify branches exist
        const git = simpleGit(repository.path);
        const branches = await git.branch();
        
        if (!branches.all.includes(head) || !branches.all.includes(base)) {
          return res.status(400).json({ error: 'One or both branches do not exist' });
        }

        // Get next PR number
        db.get(
          'SELECT MAX(pr_number) as max_num FROM pull_requests WHERE repo_id = ?',
          [repository.id],
          (err, result) => {
            if (err) {
              return res.status(500).json({ error: 'Database error' });
            }

            const prNumber = (result.max_num || 0) + 1;

            db.run(
              `INSERT INTO pull_requests (repo_id, pr_number, title, body, head_branch, base_branch, author_id) 
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [repository.id, prNumber, title, body, head, base, authorId],
              function (err) {
                if (err) {
                  return res.status(500).json({ error: 'Failed to create pull request' });
                }

                res.json({
                  message: 'Pull request created successfully',
                  pull_request: {
                    id: this.lastID,
                    number: prNumber,
                    title,
                    body,
                    head_branch: head,
                    base_branch: base,
                    state: 'open',
                    author_id: authorId
                  }
                });
              }
            );
          }
        );
      } catch (error) {
        console.error('Error creating PR:', error);
        res.status(500).json({ error: 'Failed to create pull request' });
      }
    }
  );
});

// Get all pull requests for a repository
router.get('/:owner/:repo/pulls', (req, res) => {
  const { owner, repo } = req.params;
  const { state = 'open', page = 1, per_page = 30 } = req.query;

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
        SELECT pr.*, u.username as author_name
        FROM pull_requests pr
        JOIN users u ON pr.author_id = u.id
        WHERE pr.repo_id = ?
      `;
      const params = [repository.id];

      if (state !== 'all') {
        query += ' AND pr.state = ?';
        params.push(state);
      }

      query += ' ORDER BY pr.created_at DESC LIMIT ? OFFSET ?';
      params.push(parseInt(per_page), offset);

      db.all(query, params, (err, prs) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }

        res.json({ pull_requests: prs });
      });
    }
  );
});

// Get a specific pull request
router.get('/:owner/:repo/pulls/:number', (req, res) => {
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
        `SELECT pr.*, u.username as author_name
         FROM pull_requests pr
         JOIN users u ON pr.author_id = u.id
         WHERE pr.repo_id = ? AND pr.pr_number = ?`,
        [repository.id, number],
        (err, pr) => {
          if (err || !pr) {
            return res.status(404).json({ error: 'Pull request not found' });
          }

          // Get comments
          db.all(
            `SELECT pc.*, u.username as author_name
             FROM pr_comments pc
             JOIN users u ON pc.author_id = u.id
             WHERE pc.pr_id = ?
             ORDER BY pc.created_at ASC`,
            [pr.id],
            (err, comments) => {
              if (err) {
                return res.status(500).json({ error: 'Database error' });
              }

              res.json({ pull_request: { ...pr, comments } });
            }
          );
        }
      );
    }
  );
});

// Merge a pull request
router.post('/:owner/:repo/pulls/:number/merge', authenticateToken, async (req, res) => {
  const { owner, repo, number } = req.params;
  const { commit_message } = req.body;
  const userId = req.user.id;

  db.get(
    `SELECT r.* FROM repositories r
     LEFT JOIN users u ON r.owner_id = u.id AND r.owner_type = 'user'
     LEFT JOIN organizations o ON r.owner_id = o.id AND r.owner_type = 'org'
     WHERE r.name = ? AND (u.username = ? OR o.name = ?)`,
    [repo, owner, owner],
    async (err, repository) => {
      if (err || !repository) {
        return res.status(404).json({ error: 'Repository not found' });
      }

      db.get(
        'SELECT * FROM pull_requests WHERE repo_id = ? AND pr_number = ?',
        [repository.id, number],
        async (err, pr) => {
          if (err || !pr) {
            return res.status(404).json({ error: 'Pull request not found' });
          }

          if (pr.state !== 'open') {
            return res.status(400).json({ error: 'Pull request is not open' });
          }

          try {
            const git = simpleGit(repository.path);
            
            // Checkout base branch
            await git.checkout(pr.base_branch);
            
            // Merge head branch
            const mergeMsg = commit_message || `Merge pull request #${number} from ${pr.head_branch}`;
            await git.merge([pr.head_branch, '-m', mergeMsg]);

            // Update PR status
            db.run(
              `UPDATE pull_requests 
               SET state = 'closed', merged = 1, merged_at = CURRENT_TIMESTAMP, 
                   merged_by_id = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`,
              [userId, pr.id],
              (err) => {
                if (err) {
                  return res.status(500).json({ error: 'Failed to update pull request' });
                }

                res.json({ message: 'Pull request merged successfully' });
              }
            );
          } catch (error) {
            console.error('Merge error:', error);
            res.status(500).json({ error: 'Failed to merge pull request', details: error.message });
          }
        }
      );
    }
  );
});

// Close pull request without merging
router.patch('/:owner/:repo/pulls/:number/close', authenticateToken, (req, res) => {
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
        `UPDATE pull_requests SET state = 'closed', closed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
         WHERE repo_id = ? AND pr_number = ?`,
        [repository.id, number],
        function (err) {
          if (err) {
            return res.status(500).json({ error: 'Database error' });
          }

          if (this.changes === 0) {
            return res.status(404).json({ error: 'Pull request not found' });
          }

          res.json({ message: 'Pull request closed successfully' });
        }
      );
    }
  );
});

module.exports = router;

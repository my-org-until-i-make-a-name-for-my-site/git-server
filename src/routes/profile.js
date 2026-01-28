const express = require('express');
const db = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get user profile
router.get('/:username', (req, res) => {
  const { username } = req.params;

  db.get(
    'SELECT id, username, email, role, created_at FROM users WHERE username = ?',
    [username],
    (err, user) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Get user's repositories
      db.all(
        `SELECT r.* FROM repositories r 
         WHERE r.owner_type = 'user' AND r.owner_id = ?
         ORDER BY r.created_at DESC`,
        [user.id],
        (err, repos) => {
          if (err) {
            return res.status(500).json({ error: 'Database error' });
          }

          // Get follower count
          db.get(
            'SELECT COUNT(*) as count FROM user_followers WHERE user_id = ?',
            [user.id],
            (err, followerCount) => {
              if (err) {
                return res.status(500).json({ error: 'Database error' });
              }

              // Get following count
              db.get(
                'SELECT COUNT(*) as count FROM user_followers WHERE follower_id = ?',
                [user.id],
                (err, followingCount) => {
                  if (err) {
                    return res.status(500).json({ error: 'Database error' });
                  }

                  res.json({
                    user: {
                      ...user,
                      followerCount: followerCount.count,
                      followingCount: followingCount.count
                    },
                    repositories: repos
                  });
                }
              );
            }
          );
        }
      );
    }
  );
});

// Get user's followers
router.get('/:username/followers', (req, res) => {
  const { username } = req.params;

  db.get('SELECT id FROM users WHERE username = ?', [username], (err, user) => {
    if (err || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    db.all(
      `SELECT u.id, u.username, u.email, u.created_at 
       FROM users u
       JOIN user_followers uf ON u.id = uf.follower_id
       WHERE uf.user_id = ?
       ORDER BY uf.created_at DESC`,
      [user.id],
      (err, followers) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }
        res.json({ followers });
      }
    );
  });
});

// Get users that this user follows
router.get('/:username/following', (req, res) => {
  const { username } = req.params;

  db.get('SELECT id FROM users WHERE username = ?', [username], (err, user) => {
    if (err || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    db.all(
      `SELECT u.id, u.username, u.email, u.created_at 
       FROM users u
       JOIN user_followers uf ON u.id = uf.user_id
       WHERE uf.follower_id = ?
       ORDER BY uf.created_at DESC`,
      [user.id],
      (err, following) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }
        res.json({ following });
      }
    );
  });
});

// Follow a user
router.post('/:username/follow', authenticateToken, (req, res) => {
  const { username } = req.params;
  const followerId = req.user.id;

  // Can't follow yourself
  if (req.user.username === username) {
    return res.status(400).json({ error: 'Cannot follow yourself' });
  }

  db.get('SELECT id FROM users WHERE username = ?', [username], (err, user) => {
    if (err || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    db.run(
      'INSERT INTO user_followers (user_id, follower_id) VALUES (?, ?)',
      [user.id, followerId],
      (err) => {
        if (err) {
          if (err.message.includes('UNIQUE')) {
            return res.status(400).json({ error: 'Already following this user' });
          }
          return res.status(500).json({ error: 'Database error' });
        }
        res.json({ message: `Now following ${username}` });
      }
    );
  });
});

// Unfollow a user
router.delete('/:username/follow', authenticateToken, (req, res) => {
  const { username } = req.params;
  const followerId = req.user.id;

  db.get('SELECT id FROM users WHERE username = ?', [username], (err, user) => {
    if (err || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    db.run(
      'DELETE FROM user_followers WHERE user_id = ? AND follower_id = ?',
      [user.id, followerId],
      function (err) {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }
        if (this.changes === 0) {
          return res.status(400).json({ error: 'Not following this user' });
        }
        res.json({ message: `Unfollowed ${username}` });
      }
    );
  });
});

// Check if current user follows this user
router.get('/:username/is-following', authenticateToken, (req, res) => {
  const { username } = req.params;
  const followerId = req.user.id;

  db.get('SELECT id FROM users WHERE username = ?', [username], (err, user) => {
    if (err || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    db.get(
      'SELECT id FROM user_followers WHERE user_id = ? AND follower_id = ?',
      [user.id, followerId],
      (err, follow) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }
        res.json({ isFollowing: !!follow });
      }
    );
  });
});

module.exports = router;

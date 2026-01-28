const express = require('express');
const db = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Create organization
router.post('/', authenticateToken, (req, res) => {
  const { name, display_name, description } = req.body;
  const owner_id = req.user.id;

  if (!name) {
    return res.status(400).json({ error: 'Organization name is required' });
  }

  db.run(
    'INSERT INTO organizations (name, display_name, description, owner_id) VALUES (?, ?, ?, ?)',
    [name, display_name || name, description, owner_id],
    function (err) {
      if (err) {
        if (err.message.includes('UNIQUE')) {
          return res.status(400).json({ error: 'Organization name already exists' });
        }
        return res.status(500).json({ error: 'Failed to create organization' });
      }

      const orgId = this.lastID;

      // Add owner as admin member
      db.run(
        'INSERT INTO org_members (org_id, user_id, role) VALUES (?, ?, ?)',
        [orgId, owner_id, 'admin'],
        (err) => {
          if (err) {
            return res.status(500).json({ error: 'Failed to add owner to organization' });
          }

          res.json({
            message: 'Organization created successfully',
            organization: { id: orgId, name, display_name, description, owner_id }
          });
        }
      );
    }
  );
});

// Get all organizations for current user
router.get('/', authenticateToken, (req, res) => {
  const userId = req.user.id;

  db.all(
    `SELECT DISTINCT o.* FROM organizations o
     LEFT JOIN org_members om ON o.id = om.org_id
     WHERE o.owner_id = ? OR om.user_id = ?`,
    [userId, userId],
    (err, orgs) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ organizations: orgs });
    }
  );
});

// Get organization by name
router.get('/:name', authenticateToken, (req, res) => {
  const { name } = req.params;

  db.get('SELECT * FROM organizations WHERE name = ?', [name], (err, org) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    // Get org repositories
    db.all(
      `SELECT r.* FROM repositories r 
       WHERE r.owner_type = 'org' AND r.owner_id = ?
       ORDER BY r.created_at DESC`,
      [org.id],
      (err, repos) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }

        // Get follower count
        db.get(
          'SELECT COUNT(*) as count FROM org_followers WHERE org_id = ?',
          [org.id],
          (err, followerCount) => {
            if (err) {
              return res.status(500).json({ error: 'Database error' });
            }

            res.json({
              organization: {
                ...org,
                followerCount: followerCount.count
              },
              repositories: repos
            });
          }
        );
      }
    );
  });
});

// Get organization followers
router.get('/:name/followers', (req, res) => {
  const { name } = req.params;

  db.get('SELECT id FROM organizations WHERE name = ?', [name], (err, org) => {
    if (err || !org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    db.all(
      `SELECT u.id, u.username, u.email, u.created_at 
       FROM users u
       JOIN org_followers of ON u.id = of.user_id
       WHERE of.org_id = ?
       ORDER BY of.created_at DESC`,
      [org.id],
      (err, followers) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }
        res.json({ followers });
      }
    );
  });
});

// Follow an organization
router.post('/:name/follow', authenticateToken, (req, res) => {
  const { name } = req.params;
  const userId = req.user.id;

  db.get('SELECT id FROM organizations WHERE name = ?', [name], (err, org) => {
    if (err || !org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    db.run(
      'INSERT INTO org_followers (org_id, user_id) VALUES (?, ?)',
      [org.id, userId],
      (err) => {
        if (err) {
          if (err.message.includes('UNIQUE')) {
            return res.status(400).json({ error: 'Already following this organization' });
          }
          return res.status(500).json({ error: 'Database error' });
        }
        res.json({ message: `Now following ${name}` });
      }
    );
  });
});

// Unfollow an organization
router.delete('/:name/follow', authenticateToken, (req, res) => {
  const { name } = req.params;
  const userId = req.user.id;

  db.get('SELECT id FROM organizations WHERE name = ?', [name], (err, org) => {
    if (err || !org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    db.run(
      'DELETE FROM org_followers WHERE org_id = ? AND user_id = ?',
      [org.id, userId],
      function (err) {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }
        if (this.changes === 0) {
          return res.status(400).json({ error: 'Not following this organization' });
        }
        res.json({ message: `Unfollowed ${name}` });
      }
    );
  });
});

// Check if current user follows this organization
router.get('/:name/is-following', authenticateToken, (req, res) => {
  const { name } = req.params;
  const userId = req.user.id;

  db.get('SELECT id FROM organizations WHERE name = ?', [name], (err, org) => {
    if (err || !org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    db.get(
      'SELECT id FROM org_followers WHERE org_id = ? AND user_id = ?',
      [org.id, userId],
      (err, follow) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }
        res.json({ isFollowing: !!follow });
      }
    );
  });
});

// Get organization members
router.get('/:name/members', authenticateToken, (req, res) => {
  const { name } = req.params;

  db.get('SELECT id FROM organizations WHERE name = ?', [name], (err, org) => {
    if (err || !org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    db.all(
      `SELECT u.id, u.username, u.email, om.role
       FROM org_members om
       JOIN users u ON om.user_id = u.id
       WHERE om.org_id = ?`,
      [org.id],
      (err, members) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }
        res.json({ members });
      }
    );
  });
});

// Add member to organization
router.post('/:name/members', authenticateToken, (req, res) => {
  const { name } = req.params;
  const { username, role = 'member' } = req.body;

  db.get('SELECT * FROM organizations WHERE name = ?', [name], (err, org) => {
    if (err || !org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    // Check if user is owner or admin
    if (org.owner_id !== req.user.id) {
      db.get(
        'SELECT role FROM org_members WHERE org_id = ? AND user_id = ?',
        [org.id, req.user.id],
        (err, membership) => {
          if (err || !membership || membership.role !== 'admin') {
            return res.status(403).json({ error: 'Only admins can add members' });
          }
          addMemberToOrg();
        }
      );
    } else {
      addMemberToOrg();
    }

    function addMemberToOrg() {
      db.get('SELECT id FROM users WHERE username = ?', [username], (err, user) => {
        if (err || !user) {
          return res.status(404).json({ error: 'User not found' });
        }

        db.run(
          'INSERT INTO org_members (org_id, user_id, role) VALUES (?, ?, ?)',
          [org.id, user.id, role],
          (err) => {
            if (err) {
              if (err.message.includes('UNIQUE')) {
                return res.status(400).json({ error: 'User is already a member' });
              }
              return res.status(500).json({ error: 'Failed to add member' });
            }
            res.json({ message: 'Member added successfully' });
          }
        );
      });
    }
  });
});

module.exports = router;

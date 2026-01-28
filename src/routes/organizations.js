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
    res.json({ organization: org });
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

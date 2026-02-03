const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../database');
const { hashPassword, verifyPassword } = require('../utils/password');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Register
router.post('/register', async (req, res) => {
  const { username, email, password, dob, country } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email and password are required' });
  }

  try {
    // Check if this is the first user
    db.get('SELECT COUNT(*) as count FROM users', async (err, row) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      const isFirstUser = row.count === 0;
      const hashedPassword = await hashPassword(password);
      const role = isFirstUser ? 'admin' : 'user';

      db.run(
        'INSERT INTO users (username, email, password, role, is_admin, dob, country) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [username, email, hashedPassword, role, isFirstUser ? 1 : 0, dob, country],
        function (err) {
          if (err) {
            if (err.message.includes('UNIQUE')) {
              return res.status(400).json({ error: 'Username or email already exists' });
            }
            return res.status(500).json({ error: 'Failed to create user' });
          }

          const userId = this.lastID;
          const token = jwt.sign(
            { id: userId, username, is_admin: isFirstUser, role: role },
            JWT_SECRET,
            { expiresIn: '7d' }
          );

          res.json({
            message: isFirstUser ? 'Admin user created successfully' : 'User created successfully',
            token,
            user: { id: userId, username, email, is_admin: isFirstUser, role: role }
          });
        }
      );
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Login
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await verifyPassword(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, is_admin: user.is_admin, role: user.role || 'user' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        is_admin: user.is_admin,
        role: user.role || 'user'
      }
    });
  });
});

// Get current user
router.get('/me', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }

    db.get('SELECT id, username, email, is_admin, role FROM users WHERE id = ?', [decoded.id], (err, user) => {
      if (err || !user) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json({ user });
    });
  });
});

module.exports = router;

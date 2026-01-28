require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');

// Initialize database
require('./database');

// Import routes
const authRoutes = require('./routes/auth');
const orgRoutes = require('./routes/organizations');
const repoRoutes = require('./routes/repositories');
const gitRoutes = require('./routes/git');
const agentRoutes = require('./routes/agent');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/organizations', orgRoutes);
app.use('/api/repositories', repoRoutes);
app.use('/api/agent', agentRoutes);

// Git HTTP backend
app.use('/git', gitRoutes);

// Serve frontend for all other routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Git server running on http://localhost:${PORT}`);
  console.log(`Git clone URL format: http://localhost:${PORT}/git/{owner}/{repo}`);
});

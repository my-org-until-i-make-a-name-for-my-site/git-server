const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const db = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Store running code-server instances
const editorInstances = new Map();
const REPO_PATH_SETTING = process.env.REPOS_BASE_PATH || (process.platform === 'win32' ? 'Z:/mnt/repos' : '/mnt/repos');
const REPOS_BASE_PATH = path.resolve(REPO_PATH_SETTING);
const EDITOR_BASE_PORT = 8080; // Starting port for editors

// Start VSCode editor for a repository
router.post('/:owner/:repo/editor/start', authenticateToken, async (req, res) => {
  const { owner, repo } = req.params;
  const userId = req.user.id;

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

      // Check if editor is already running for this repo
      const instanceKey = `${owner}/${repo}`;
      if (editorInstances.has(instanceKey)) {
        const instance = editorInstances.get(instanceKey);
        return res.json({
          message: 'Editor already running',
          url: `http://localhost:${instance.port}`,
          port: instance.port
        });
      }

      try {
        // Find available port
        const port = EDITOR_BASE_PORT + editorInstances.size;

        // For now, we'll create a simple file browser API endpoint
        // In production, you would install and run code-server here
        // For this implementation, we'll use a lightweight approach

        const instance = {
          port,
          repoPath: repository.path,
          owner,
          repo,
          userId,
          startedAt: Date.now()
        };

        editorInstances.set(instanceKey, instance);

        res.json({
          message: 'Editor started',
          url: `/editor/${owner}/${repo}`,
          port,
          note: 'Using integrated editor. For full VSCode, install code-server separately.'
        });
      } catch (error) {
        console.error('Error starting editor:', error);
        res.status(500).json({ error: 'Failed to start editor' });
      }
    }
  );
});

// Stop VSCode editor
router.post('/:owner/:repo/editor/stop', authenticateToken, (req, res) => {
  const { owner, repo } = req.params;
  const instanceKey = `${owner}/${repo}`;

  if (!editorInstances.has(instanceKey)) {
    return res.status(404).json({ error: 'Editor not running' });
  }

  const instance = editorInstances.get(instanceKey);
  
  // If there was a process, kill it
  if (instance.process) {
    instance.process.kill();
  }

  editorInstances.delete(instanceKey);

  res.json({ message: 'Editor stopped' });
});

// Get editor status
router.get('/:owner/:repo/editor/status', authenticateToken, (req, res) => {
  const { owner, repo } = req.params;
  const instanceKey = `${owner}/${repo}`;

  if (!editorInstances.has(instanceKey)) {
    return res.json({ running: false });
  }

  const instance = editorInstances.get(instanceKey);
  res.json({
    running: true,
    url: `/editor/${owner}/${repo}`,
    port: instance.port,
    startedAt: instance.startedAt
  });
});

// List all running editors (admin only)
router.get('/editors/list', authenticateToken, (req, res) => {
  if (!req.user.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const editors = Array.from(editorInstances.entries()).map(([key, instance]) => ({
    repository: key,
    port: instance.port,
    userId: instance.userId,
    startedAt: instance.startedAt
  }));

  res.json({ editors });
});

module.exports = router;
module.exports.editorInstances = editorInstances;

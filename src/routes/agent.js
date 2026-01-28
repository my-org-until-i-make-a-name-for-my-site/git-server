const express = require('express');
const { spawn } = require('child_process');
const { authenticateToken, isAdmin } = require('../middleware/auth');

const router = express.Router();

// Execute command (admin only for security)
router.post('/execute', authenticateToken, isAdmin, (req, res) => {
  const { command, args = [], cwd } = req.body;

  if (!command) {
    return res.status(400).json({ error: 'Command is required' });
  }

  // Security: Whitelist allowed commands
  const allowedCommands = ['git', 'npm', 'node', 'bash', 'sh', 'ls', 'cat', 'echo', 'pwd'];
  
  if (!allowedCommands.includes(command)) {
    return res.status(403).json({ error: 'Command not allowed' });
  }

  const process = spawn(command, args, {
    cwd: cwd || '/tmp',
    shell: false,
    timeout: 60000 // 60 second timeout
  });

  let stdout = '';
  let stderr = '';

  process.stdout.on('data', (data) => {
    stdout += data.toString();
  });

  process.stderr.on('data', (data) => {
    stderr += data.toString();
  });

  process.on('close', (code) => {
    res.json({
      exitCode: code,
      stdout,
      stderr
    });
  });

  process.on('error', (error) => {
    res.status(500).json({ error: error.message });
  });
});

// Execute workflow (admin only)
router.post('/workflow', authenticateToken, isAdmin, (req, res) => {
  const { steps, cwd } = req.body;

  if (!steps || !Array.isArray(steps)) {
    return res.status(400).json({ error: 'Steps array is required' });
  }

  const results = [];
  let currentIndex = 0;

  function executeStep(step) {
    const { command, args = [] } = step;
    
    const allowedCommands = ['git', 'npm', 'node', 'bash', 'sh', 'ls', 'cat', 'echo', 'pwd'];
    
    if (!allowedCommands.includes(command)) {
      results.push({
        step: currentIndex,
        command,
        error: 'Command not allowed',
        exitCode: -1
      });
      currentIndex++;
      if (currentIndex < steps.length) {
        executeStep(steps[currentIndex]);
      } else {
        res.json({ results });
      }
      return;
    }

    const process = spawn(command, args, {
      cwd: cwd || '/tmp',
      shell: false,
      timeout: 60000
    });

    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      results.push({
        step: currentIndex,
        command,
        args,
        exitCode: code,
        stdout,
        stderr
      });

      currentIndex++;
      if (currentIndex < steps.length && code === 0) {
        executeStep(steps[currentIndex]);
      } else {
        res.json({ results });
      }
    });

    process.on('error', (error) => {
      results.push({
        step: currentIndex,
        command,
        error: error.message,
        exitCode: -1
      });
      res.json({ results });
    });
  }

  executeStep(steps[0]);
});

// Get system info (admin only)
router.get('/system-info', authenticateToken, isAdmin, (req, res) => {
  res.json({
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage()
  });
});

module.exports = router;

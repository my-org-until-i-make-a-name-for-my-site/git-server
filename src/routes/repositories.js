const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const git = require('isomorphic-git');
const db = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const REPOS_BASE_PATH = process.env.REPOS_BASE_PATH || './repos';

// Ensure repos directory exists
fs.ensureDirSync(REPOS_BASE_PATH);
console.log(`Repositories directory: ${REPOS_BASE_PATH}`);

// Create repository
router.post('/', authenticateToken, async (req, res) => {
  const { name, description, owner_type = 'user', owner_name, is_private = 0 } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Repository name is required' });
  }

  let ownerPath, ownerId, ownerDbType;

  if (owner_type === 'user') {
    ownerPath = req.user.username;
    ownerId = req.user.id;
    ownerDbType = 'user';
  } else if (owner_type === 'org') {
    if (!owner_name) {
      return res.status(400).json({ error: 'Organization name is required' });
    }
    
    // Check if user has permission to create repos in this org
    const org = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM organizations WHERE name = ?', [owner_name], (err, org) => {
        if (err) reject(err);
        else resolve(org);
      });
    });

    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const canCreate = await new Promise((resolve) => {
      if (org.owner_id === req.user.id) {
        resolve(true);
      } else {
        db.get(
          'SELECT role FROM org_members WHERE org_id = ? AND user_id = ?',
          [org.id, req.user.id],
          (err, member) => {
            resolve(member && (member.role === 'admin' || member.role === 'member'));
          }
        );
      }
    });

    if (!canCreate) {
      return res.status(403).json({ error: 'No permission to create repository in this organization' });
    }

    ownerPath = owner_name;
    ownerId = org.id;
    ownerDbType = 'org';
  } else {
    return res.status(400).json({ error: 'Invalid owner_type' });
  }

  const repoPath = path.join(REPOS_BASE_PATH, ownerPath, name);
  
  // Check if repo already exists
  if (await fs.pathExists(repoPath)) {
    return res.status(400).json({ error: 'Repository already exists at this path' });
  }

  try {
    // Create directory
    await fs.ensureDir(repoPath);

    // Initialize git repository with compression
    await git.init({ 
      fs, 
      dir: repoPath, 
      bare: true,
      defaultBranch: 'main'
    });

    // Configure compression for the repo
    const configPath = path.join(repoPath, 'config');
    let configContent = await fs.readFile(configPath, 'utf8');
    
    // Add compression settings
    if (!configContent.includes('[core]')) {
      configContent += '\n[core]\n';
    }
    configContent += '\tcompression = 9\n';
    configContent += '\tlooseCompression = 9\n';
    configContent += '[pack]\n';
    configContent += '\tcompression = 9\n';
    configContent += '\tdeltaCacheSize = 512m\n';
    configContent += '\tpackSizeLimit = 512m\n';
    configContent += '\twindowMemory = 512m\n';
    
    await fs.writeFile(configPath, configContent);

    // Save to database
    db.run(
      'INSERT INTO repositories (name, description, owner_type, owner_id, path, is_private) VALUES (?, ?, ?, ?, ?, ?)',
      [name, description, ownerDbType, ownerId, repoPath, is_private],
      function (err) {
        if (err) {
          // Cleanup
          fs.remove(repoPath).catch(console.error);
          return res.status(500).json({ error: 'Failed to create repository in database' });
        }

        res.json({
          message: 'Repository created successfully',
          repository: {
            id: this.lastID,
            name,
            description,
            owner_type: ownerDbType,
            owner: ownerPath,
            path: repoPath,
            is_private,
            clone_url: `http://localhost:${process.env.PORT || 3000}/git/${ownerPath}/${name}`
          }
        });
      }
    );
  } catch (error) {
    console.error('Error creating repository:', error);
    // Cleanup
    fs.remove(repoPath).catch(console.error);
    res.status(500).json({ error: 'Failed to create repository' });
  }
});

// Get repositories for user
router.get('/', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const username = req.user.username;

  // Get user repos
  db.all(
    `SELECT r.*, u.username as owner_name FROM repositories r
     JOIN users u ON r.owner_id = u.id
     WHERE r.owner_type = 'user' AND r.owner_id = ?
     UNION
     SELECT r.*, o.name as owner_name FROM repositories r
     JOIN organizations o ON r.owner_id = o.id
     JOIN org_members om ON o.id = om.org_id
     WHERE r.owner_type = 'org' AND om.user_id = ?`,
    [userId, userId],
    (err, repos) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      const reposWithUrls = repos.map(repo => ({
        ...repo,
        clone_url: `http://localhost:${process.env.PORT || 3000}/git/${repo.owner_name}/${repo.name}`
      }));

      res.json({ repositories: reposWithUrls });
    }
  );
});

// Get specific repository
router.get('/:owner/:repo', authenticateToken, (req, res) => {
  const { owner, repo } = req.params;

  db.get(
    `SELECT r.*, 
     CASE 
       WHEN r.owner_type = 'user' THEN (SELECT username FROM users WHERE id = r.owner_id)
       WHEN r.owner_type = 'org' THEN (SELECT name FROM organizations WHERE id = r.owner_id)
     END as owner_name
     FROM repositories r
     WHERE r.name = ?`,
    [repo],
    (err, repository) => {
      if (err || !repository) {
        return res.status(404).json({ error: 'Repository not found' });
      }

      if (repository.owner_name !== owner) {
        return res.status(404).json({ error: 'Repository not found' });
      }

      res.json({
        repository: {
          ...repository,
          clone_url: `http://localhost:${process.env.PORT || 3000}/git/${owner}/${repo}`
        }
      });
    }
  );
});

// List files in repository
router.get('/:owner/:repo/files', authenticateToken, async (req, res) => {
  const { owner, repo } = req.params;
  const { ref = 'main', path: filePath = '' } = req.query;

  try {
    const repoPath = path.join(REPOS_BASE_PATH, owner, repo);
    
    if (!await fs.pathExists(repoPath)) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    // Try to read the tree
    try {
      const tree = await git.readTree({
        fs,
        dir: repoPath,
        oid: ref,
        filepath: filePath
      });

      res.json({ tree });
    } catch (error) {
      // Repository might be empty
      res.json({ tree: [], message: 'Repository is empty or ref not found' });
    }
  } catch (error) {
    console.error('Error reading repository:', error);
    res.status(500).json({ error: 'Failed to read repository' });
  }
});

module.exports = router;

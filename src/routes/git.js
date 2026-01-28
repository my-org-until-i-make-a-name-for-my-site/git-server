const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs-extra');

const router = express.Router();
const REPOS_BASE_PATH = process.env.REPOS_BASE_PATH || './repos';

// Git HTTP backend handler
router.use('/:owner/:repo', async (req, res) => {
  const { owner, repo } = req.params;
  const repoPath = path.join(REPOS_BASE_PATH, owner, repo);

  // Check if repository exists
  if (!await fs.pathExists(repoPath)) {
    return res.status(404).send('Repository not found');
  }

  // Set up git http backend
  const service = req.query.service || '';
  const isInfoRequest = req.url.includes('/info/refs');

  if (isInfoRequest) {
    // Handle info/refs requests
    const gitService = service.replace('git-', '');
    
    if (!['upload-pack', 'receive-pack'].includes(gitService)) {
      return res.status(403).send('Forbidden');
    }

    res.setHeader('Content-Type', `application/x-git-${gitService}-advertisement`);
    res.setHeader('Cache-Control', 'no-cache');

    const args = [gitService, '--stateless-rpc', '--advertise-refs', repoPath];
    const git = spawn('git', args);

    // Write the pkt-line header
    const serviceHeader = `# service=git-${gitService}\n`;
    const length = (serviceHeader.length + 4).toString(16).padStart(4, '0');
    res.write(length + serviceHeader + '0000');

    git.stdout.pipe(res);
    git.stderr.on('data', (data) => console.error('Git stderr:', data.toString()));
    git.on('close', (code) => {
      if (code !== 0) {
        console.error(`Git process exited with code ${code}`);
      }
    });
  } else {
    // Handle git-upload-pack and git-receive-pack requests
    let gitService = '';
    if (req.url.includes('/git-upload-pack')) {
      gitService = 'upload-pack';
    } else if (req.url.includes('/git-receive-pack')) {
      gitService = 'receive-pack';
    } else {
      return res.status(404).send('Not found');
    }

    res.setHeader('Content-Type', `application/x-git-${gitService}-result`);
    res.setHeader('Cache-Control', 'no-cache');

    const args = [gitService, '--stateless-rpc', repoPath];
    const git = spawn('git', args);

    req.pipe(git.stdin);
    git.stdout.pipe(res);
    git.stderr.on('data', (data) => console.error('Git stderr:', data.toString()));
    
    git.on('close', (code) => {
      if (code !== 0) {
        console.error(`Git process exited with code ${code}`);
      }
    });
  }
});

module.exports = router;

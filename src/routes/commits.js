const express = require('express');
const db = require('../database');
const { authenticateToken } = require('../middleware/auth');
const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs-extra');

const router = express.Router();
const REPOS_BASE_PATH = process.env.REPOS_BASE_PATH || './repos';

// Get commits for a repository
router.get('/:owner/:repo/commits', async (req, res) => {
    const { owner, repo } = req.params;
    const { branch = 'main', page = 1, per_page = 30 } = req.query;

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
                const offset = (parseInt(page) - 1) * parseInt(per_page);

                // Get commits from git with branch filtering
                const git = simpleGit(repository.path);
                const branches = await git.branch(['--all']);
                const targetBranch = branches.all.includes(branch)
                    ? branch
                    : (branches.current || branches.all[0]);

                if (!targetBranch) {
                    return res.json({ commits: [] });
                }

                git.log({
                    from: targetBranch,
                    maxCount: parseInt(per_page),
                    '--skip': offset
                }).then(log => {
                    // Store commits in database for future use
                    log.all.forEach(commit => {
                        db.run(
                            `INSERT OR IGNORE INTO commits (repo_id, sha, author_name, author_email, message, created_at) 
                 VALUES (?, ?, ?, ?, ?, datetime('now'))`,
                            [repository.id, commit.hash, commit.author_name, commit.author_email, commit.message]
                        );
                    });

                    res.json({
                        commits: log.all.map(c => ({
                            sha: c.hash,
                            author_name: c.author_name,
                            author_email: c.author_email,
                            message: c.message,
                            date: c.date,
                            hash: c.hash
                        })),
                        branch: targetBranch
                    });
                }).catch(error => {
                    console.error('Error getting commits from git:', error);
                    res.status(500).json({ error: 'Failed to get commits' });
                });
            } catch (error) {
                console.error('Error getting commits:', error);
                res.status(500).json({ error: 'Failed to get commits' });
            }
        }
    );
});

// Get a specific commit
router.get('/:owner/:repo/commits/:sha', async (req, res) => {
    const { owner, repo, sha } = req.params;

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
                const git = simpleGit(repository.path);
                const commit = await git.show([sha]);

                res.json({ commit: commit });
            } catch (error) {
                console.error('Error getting commit:', error);
                res.status(404).json({ error: 'Commit not found' });
            }
        }
    );
});

// Get branches
router.get('/:owner/:repo/branches', async (req, res) => {
    const { owner, repo } = req.params;

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
                const git = simpleGit(repository.path);
                const branches = await git.branch(['--all']);

                res.json({ branches: branches.all, current: branches.current });
            } catch (error) {
                console.error('Error getting branches:', error);
                res.status(500).json({ error: 'Failed to get branches' });
            }
        }
    );
});

// Create a new branch
router.post('/:owner/:repo/branches', authenticateToken, async (req, res) => {
    const { owner, repo } = req.params;
    const { name, from } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Branch name is required' });
    }

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
                const git = simpleGit(repository.path);
                await git.checkoutLocalBranch(name);

                if (from) {
                    await git.reset(['--hard', from]);
                }

                res.json({ message: `Branch ${name} created successfully` });
            } catch (error) {
                console.error('Error creating branch:', error);
                res.status(500).json({ error: 'Failed to create branch' });
            }
        }
    );
});

// Get file tree
router.get('/:owner/:repo/tree/:branch', async (req, res) => {
    const { owner, repo, branch } = req.params;

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
                const git = simpleGit(repository.path);

                // Use git ls-tree to get the file listing for the root directory
                const output = await git.raw(['ls-tree', '-r', branch]);

                if (!output || output.trim() === '') {
                    return res.json({ tree: [] });
                }

                const tree = output
                    .split('\n')
                    .filter(line => line.trim())
                    .map(line => {
                        const parts = line.split('\t');
                        const [mode, type, hash] = parts[0].split(/\s+/);
                        const filepath = parts[1];

                        return {
                            name: path.basename(filepath),
                            path: filepath,
                            type: type === 'blob' ? 'blob' : 'tree',
                            size: 0
                        };
                    })
                    // Only show root level items
                    .filter((item, index, arr) => {
                        const parentPath = item.path.substring(0, item.path.lastIndexOf('/'));
                        return !parentPath.includes('/');
                    });

                res.json({ tree });
            } catch (error) {
                console.error('Error reading tree:', error);
                res.status(500).json({ error: 'Failed to read repository tree' });
            }
        }
    );
});

// Get file tree with path
router.get('/:owner/:repo/tree/:branch/:filepath', async (req, res) => {
    const { owner, repo, branch, filepath } = req.params;

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
                const fullPath = path.join(repository.path, filepath);

                if (!fs.existsSync(fullPath)) {
                    return res.status(404).json({ error: 'Path not found' });
                }

                const stats = fs.statSync(fullPath);

                if (stats.isDirectory()) {
                    const files = fs.readdirSync(fullPath);
                    const tree = files
                        .filter(f => !f.startsWith('.git'))
                        .map(file => {
                            const filePath = path.join(fullPath, file);
                            const fileStats = fs.statSync(filePath);
                            return {
                                name: file,
                                path: path.join(filepath, file),
                                type: fileStats.isDirectory() ? 'tree' : 'blob',
                                size: fileStats.size
                            };
                        });

                    res.json({ tree });
                } else {
                    // Return file content
                    const content = fs.readFileSync(fullPath, 'utf8');
                    res.json({
                        type: 'blob',
                        content,
                        size: stats.size,
                        path: filepath
                    });
                }
            } catch (error) {
                console.error('Error reading tree:', error);
                res.status(500).json({ error: 'Failed to read repository tree' });
            }
        }
    );
});

// Get file content
router.get('/:owner/:repo/contents/:branch/:filepath', async (req, res) => {
    const { owner, repo, branch } = req.params;
    let { filepath } = req.params;

    // Handle multiple path segments
    const pathParts = decodeURIComponent(req.path).split('/');
    const contentsIndex = pathParts.indexOf('contents');
    if (contentsIndex !== -1 && contentsIndex + 2 < pathParts.length) {
        filepath = pathParts.slice(contentsIndex + 2).join('/');
    }

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
                const git = simpleGit(repository.path);
                const content = await git.show([`${branch}:${filepath}`]);

                res.json({
                    content,
                    size: content.length,
                    path: filepath,
                    name: path.basename(filepath)
                });
            } catch (error) {
                console.error('Error reading file:', error);
                res.status(404).json({ error: 'File not found' });
            }
        }
    );
});

// Create or update file content
router.post('/:owner/:repo/contents/:branch/:filepath', authenticateToken, async (req, res) => {
    const { owner, repo, branch } = req.params;
    let { filepath } = req.params;
    const { content = '', message } = req.body;

    const pathParts = decodeURIComponent(req.path).split('/');
    const contentsIndex = pathParts.indexOf('contents');
    if (contentsIndex !== -1 && contentsIndex + 2 < pathParts.length) {
        filepath = pathParts.slice(contentsIndex + 2).join('/');
    }

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

            let tempDir;
            try {
                const git = simpleGit(repository.path);
                const branches = await git.branch(['--all']);
                const branchName = branches.all.includes(branch)
                    ? branch
                    : (branches.current || branches.all[0] || branch);

                tempDir = path.join(repository.path, '..', `.edit-${repo}-${Date.now()}`);
                await fs.ensureDir(tempDir);

                const workingGit = simpleGit(tempDir);
                await workingGit.init(['--initial-branch', branchName]);
                await workingGit.addRemote('origin', path.resolve(repository.path));
                try {
                    await workingGit.fetch('origin', branchName);
                    await workingGit.checkout(['-b', branchName, `origin/${branchName}`]);
                } catch (fetchError) {
                    await workingGit.checkoutLocalBranch(branchName);
                }
                await workingGit.addConfig('user.name', req.user.username);
                await workingGit.addConfig('user.email', req.user.email || 'user@codara.dev');

                const targetPath = path.join(tempDir, filepath);
                await fs.ensureDir(path.dirname(targetPath));
                await fs.writeFile(targetPath, content);

                await workingGit.add(filepath);
                const commitMessage = message || `Update ${filepath}`;
                await workingGit.commit(commitMessage, filepath);
                await workingGit.push('origin', branchName);

                await fs.remove(tempDir);
                res.json({ message: 'File saved', path: filepath });
            } catch (error) {
                console.error('Error saving file:', error);
                if (tempDir) {
                    await fs.remove(tempDir).catch(() => {});
                }
                res.status(500).json({ error: 'Failed to save file' });
            }
        }
    );
});

// Delete file content
router.delete('/:owner/:repo/contents/:branch/:filepath', authenticateToken, async (req, res) => {
    const { owner, repo, branch } = req.params;
    let { filepath } = req.params;

    const pathParts = decodeURIComponent(req.path).split('/');
    const contentsIndex = pathParts.indexOf('contents');
    if (contentsIndex !== -1 && contentsIndex + 2 < pathParts.length) {
        filepath = pathParts.slice(contentsIndex + 2).join('/');
    }

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

            let tempDir;
            try {
                const git = simpleGit(repository.path);
                const branches = await git.branch(['--all']);
                const branchName = branches.all.includes(branch)
                    ? branch
                    : (branches.current || branches.all[0] || branch);

                tempDir = path.join(repository.path, '..', `.edit-${repo}-${Date.now()}`);
                await fs.ensureDir(tempDir);

                const workingGit = simpleGit(tempDir);
                await workingGit.init(['--initial-branch', branchName]);
                await workingGit.addRemote('origin', path.resolve(repository.path));
                try {
                    await workingGit.fetch('origin', branchName);
                    await workingGit.checkout(['-b', branchName, `origin/${branchName}`]);
                } catch (fetchError) {
                    await workingGit.checkoutLocalBranch(branchName);
                }
                await workingGit.addConfig('user.name', req.user.username);
                await workingGit.addConfig('user.email', req.user.email || 'user@codara.dev');

                const targetPath = path.join(tempDir, filepath);
                if (await fs.pathExists(targetPath)) {
                    await fs.remove(targetPath);
                }
                await workingGit.rm(filepath);
                await workingGit.commit(`Delete ${filepath}`, filepath);
                await workingGit.push('origin', branchName);

                await fs.remove(tempDir);
                res.json({ message: 'File deleted', path: filepath });
            } catch (error) {
                console.error('Error deleting file:', error);
                if (tempDir) {
                    await fs.remove(tempDir).catch(() => {});
                }
                res.status(500).json({ error: 'Failed to delete file' });
            }
        }
    );
});

// Record push event
router.post('/:owner/:repo/push', authenticateToken, (req, res) => {
    const { owner, repo } = req.params;
    const { ref, before, after, commits = [] } = req.body;
    const userId = req.user.id;

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
                `INSERT INTO push_events (repo_id, user_id, ref, before_sha, after_sha, commit_count) 
         VALUES (?, ?, ?, ?, ?, ?)`,
                [repository.id, userId, ref, before, after, commits.length],
                function (err) {
                    if (err) {
                        console.error('Error recording push:', err);
                        return res.status(500).json({ error: 'Failed to record push event' });
                    }

                    res.json({ message: 'Push event recorded' });
                }
            );
        }
    );
});

// Get contributors for a repository
router.get('/:owner/:repo/contributors', async (req, res) => {
    const { owner, repo } = req.params;

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
                const git = simpleGit(repository.path);
                const log = await git.log();

                // Count contributions per author
                const contributorsMap = {};
                log.all.forEach(commit => {
                    const key = commit.author_email;
                    if (!contributorsMap[key]) {
                        contributorsMap[key] = {
                            name: commit.author_name,
                            email: commit.author_email,
                            commits: 0
                        };
                    }
                    contributorsMap[key].commits++;
                });

                const contributors = Object.values(contributorsMap)
                    .sort((a, b) => b.commits - a.commits);

                res.json({ contributors });
            } catch (error) {
                console.error('Error getting contributors:', error);
                res.status(500).json({ error: 'Failed to get contributors' });
            }
        }
    );
});

// Add collaborator to repository
router.post('/:owner/:repo/collaborators', authenticateToken, async (req, res) => {
    const { owner, repo } = req.params;
    const { username, permission = 'write' } = req.body;

    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }

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

            // Check if user is owner
            if (repository.owner_id !== req.user.id) {
                return res.status(403).json({ error: 'Only repository owner can add collaborators' });
            }

            // Get user to add
            db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
                if (err || !user) {
                    return res.status(404).json({ error: 'User not found' });
                }

                // Add collaborator
                db.run(
                    `INSERT OR REPLACE INTO repo_collaborators (repo_id, user_id, permission) 
           VALUES (?, ?, ?)`,
                    [repository.id, user.id, permission],
                    function (err) {
                        if (err) {
                            console.error('Error adding collaborator:', err);
                            return res.status(500).json({ error: 'Failed to add collaborator' });
                        }

                        res.json({ message: `${username} added as collaborator` });
                    }
                );
            });
        }
    );
});

// Get collaborators
router.get('/:owner/:repo/collaborators', async (req, res) => {
    const { owner, repo } = req.params;

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

            db.all(
                `SELECT u.username, u.email, c.permission, c.created_at
         FROM repo_collaborators c
         JOIN users u ON c.user_id = u.id
         WHERE c.repo_id = ?`,
                [repository.id],
                (err, collaborators) => {
                    if (err) {
                        console.error('Error getting collaborators:', err);
                        return res.status(500).json({ error: 'Failed to get collaborators' });
                    }

                    res.json({ collaborators: collaborators || [] });
                }
            );
        }
    );
});

module.exports = router;

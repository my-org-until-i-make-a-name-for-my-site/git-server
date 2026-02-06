const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const git = require('isomorphic-git');
const simpleGit = require('simple-git');
const db = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const REPOS_BASE_PATH = path.resolve(process.env.REPOS_BASE_PATH || 'Z:/mnt/repos');

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

        // Initialize git repository using native git command for full compatibility
        const gitInstance = simpleGit(repoPath);
        await gitInstance.init(['--bare', '--initial-branch=main']);

        // Configure compression and other settings
        await gitInstance.addConfig('core.compression', '9');
        await gitInstance.addConfig('core.looseCompression', '9');
        await gitInstance.addConfig('pack.compression', '9');
        await gitInstance.addConfig('pack.deltaCacheSize', '512m');
        await gitInstance.addConfig('pack.packSizeLimit', '512m');
        await gitInstance.addConfig('pack.windowMemory', '512m');
        await gitInstance.addConfig('receive.denyNonFastForwards', 'false');
        await gitInstance.addConfig('receive.denyDeletes', 'false');

        // Create description file
        const descPath = path.join(repoPath, 'description');
        await fs.writeFile(descPath, description || `${name} repository\n`);

        // Create initial README in a temp directory and push to bare repo
        const tempDir = path.join(repoPath, '..', `.temp-${name}`);
        try {
            await fs.ensureDir(tempDir);
            const tempGit = simpleGit(tempDir);

            // Initialize non-bare repo
            await tempGit.init(['--initial-branch=main']);
            await tempGit.addConfig('user.name', req.user.username);
            await tempGit.addConfig('user.email', req.user.email || 'user@codara.dev');

            // Create initial README
            const readmePath = path.join(tempDir, 'README.md');
            await fs.writeFile(readmePath, `# ${name}\n\n${description || 'A new repository on Codara'}\n`);

            // Commit and push to bare repo
            await tempGit.addRemote('origin', path.resolve(repoPath));
            await tempGit.add('README.md');
            await tempGit.commit('Initial commit');

            await tempGit.push(['-u', 'origin', 'main']);

            // Clean up temp directory
            await fs.remove(tempDir);
        } catch (initError) {
            console.error('Error creating initial README:', initError);
            // Continue even if README creation fails
            await fs.remove(tempDir).catch(() => { });
        }

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
                        clone_url: `${req.protocol}://${req.get('host')}/${ownerPath}/${name}.git`
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
router.get('/my', authenticateToken, (req, res) => {
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

            const baseUrl = `${req.protocol}://${req.get('host')}`;
            const reposWithUrls = repos.map(repo => ({
                ...repo,
                clone_url: `${baseUrl}/${repo.owner_name}/${repo.name}.git`
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
                    clone_url: `${req.protocol}://${req.get('host')}/${owner}/${repo}.git`
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

        let targetRef = ref;

        // Try to read the tree
        try {
            const tree = await git.readTree({
                fs,
                dir: repoPath,
                oid: targetRef,
                filepath: filePath
            });

            return res.json({ tree, ref: targetRef });
        } catch (error) {
            // Fall back to current/default branch if ref not found
            try {
                const gitClient = simpleGit(repoPath);
                const branches = await gitClient.branch();
                targetRef = branches.current || branches.all[0];

                if (!targetRef) {
                    return res.json({ tree: [], message: 'Repository is empty' });
                }

                const tree = await git.readTree({
                    fs,
                    dir: repoPath,
                    oid: targetRef,
                    filepath: filePath
                });

                return res.json({ tree, ref: targetRef });
            } catch (fallbackError) {
                return res.json({ tree: [], message: 'Repository is empty or ref not found' });
            }
        }
    } catch (error) {
        console.error('Error reading repository:', error);
        res.status(500).json({ error: 'Failed to read repository' });
    }
});

module.exports = router;

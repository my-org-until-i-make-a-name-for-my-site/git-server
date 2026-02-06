const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs-extra');
const db = require('../database');

const router = express.Router();
const REPO_PATH_SETTING = process.env.REPOS_BASE_PATH || (process.platform === 'win32' ? 'Z:/mnt/repos' : '/mnt/repos');
const REPOS_BASE_PATH = path.resolve(REPO_PATH_SETTING);
const DIST_PATH = path.join(__dirname, '../../dist');

fs.ensureDirSync(REPOS_BASE_PATH);

const sendIndex = (res) => res.sendFile(path.join(DIST_PATH, 'index.html'));

const parseGitPath = (rawPath) => {
    const normalized = (rawPath || '').replace(/^\/+/, '');
    if (!normalized) return { isGitPath: false };

    const parts = normalized.split('/');
    const usesGitPrefix = parts[0] === 'git';
    const ownerIndex = usesGitPrefix ? 1 : 0;
    const repoIndex = usesGitPrefix ? 2 : 1;

    if (parts.length < repoIndex + 1) {
        return { isGitPath: true, incomplete: true };
    }

    const owner = parts[ownerIndex];
    let repo = parts[repoIndex];

    if (!owner || !repo) {
        return { isGitPath: true, incomplete: true };
    }

    if (repo.endsWith('.git')) {
        repo = repo.slice(0, -4);
    }

    const rest = parts.slice(repoIndex + 1).join('/');
    return { isGitPath: true, owner, repo, rest };
};

const getRepository = (owner, repo) => new Promise((resolve, reject) => {
    db.get(
        `SELECT r.* FROM repositories r
     LEFT JOIN users u ON r.owner_id = u.id AND r.owner_type = 'user'
     LEFT JOIN organizations o ON r.owner_id = o.id AND r.owner_type = 'org'
     WHERE r.name = ? AND (u.username = ? OR o.name = ?)`,
        [repo, owner, owner],
        (err, repository) => {
            if (err) return reject(err);
            resolve(repository);
        }
    );
});

const updateBranches = async (repoId, repoPath) => {
    if (!repoId || !repoPath) return;

    const output = await new Promise((resolve) => {
        const git = spawn('git', ['for-each-ref', 'refs/heads', '--format=%(refname:short)\t%(objectname)'], {
            cwd: repoPath
        });

        let buffer = '';
        let errorBuffer = '';

        git.stdout.on('data', (data) => {
            buffer += data.toString();
        });

        git.stderr.on('data', (data) => {
            errorBuffer += data.toString();
        });

        git.on('close', (code) => {
            if (code !== 0) {
                console.error('Failed to read branches:', errorBuffer);
                return resolve('');
            }

            resolve(buffer);
        });
    });

    const lines = output
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

    if (lines.length === 0) return;

    const branches = lines.map((line) => {
        const [name, headSha] = line.split('\t');
        return { name, headSha };
    });

    const defaultName = branches.find((branch) => branch.name === 'main')?.name
        || branches.find((branch) => branch.name === 'master')?.name
        || branches[0].name;

    await new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run('DELETE FROM branches WHERE repo_id = ?', [repoId], (deleteErr) => {
                if (deleteErr) return reject(deleteErr);

                const stmt = db.prepare(
                    'INSERT INTO branches (repo_id, name, head_sha, is_default) VALUES (?, ?, ?, ?)'
                );

                branches.forEach((branch) => {
                    stmt.run(
                        repoId,
                        branch.name,
                        branch.headSha,
                        branch.name === defaultName ? 1 : 0
                    );
                });

                stmt.finalize((finalizeErr) => {
                    if (finalizeErr) return reject(finalizeErr);
                    resolve();
                });
            });
        });
    });
};

const extractAndStoreCommits = async (repoId, repoPath) => {
    if (!repoId || !repoPath) return;

    const output = await new Promise((resolve) => {
        const git = spawn('git', [
            'log',
            '--all',
            '--pretty=format:%H%n%an%n%ae%n%s%n%B%n--COMMIT_SEPARATOR--'
        ], {
            cwd: repoPath
        });

        let buffer = '';
        let errorBuffer = '';

        git.stdout.on('data', (data) => {
            buffer += data.toString();
        });

        git.stderr.on('data', (data) => {
            errorBuffer += data.toString();
        });

        git.on('close', (code) => {
            if (code !== 0) {
                console.error('Failed to read commits:', errorBuffer);
                return resolve('');
            }

            resolve(buffer);
        });
    });

    const commitStrings = output.split('--COMMIT_SEPARATOR--').filter(Boolean);

    if (commitStrings.length === 0) return;

    await new Promise((resolve, reject) => {
        const stmt = db.prepare(
            `INSERT OR IGNORE INTO commits 
             (repo_id, sha, author_name, author_email, message, created_at) 
             VALUES (?, ?, ?, ?, ?, datetime('now'))`
        );

        commitStrings.forEach((commitStr) => {
            const lines = commitStr.trim().split('\n').filter(Boolean);
            if (lines.length >= 4) {
                const sha = lines[0];
                const authorName = lines[1];
                const authorEmail = lines[2];
                const subject = lines[3];

                stmt.run(repoId, sha, authorName, authorEmail, subject, (err) => {
                    if (err) {
                        console.error('Error inserting commit:', err);
                    }
                });
            }
        });

        stmt.finalize((finalizeErr) => {
            if (finalizeErr) return reject(finalizeErr);
            resolve();
        });
    });
};

router.use(/(.*)/, async (req, res) => {
    try {
        const rawPath = req.params?.[0] || req.path || '';
        const parsed = parseGitPath(rawPath);

        if (!parsed.isGitPath) {
            return sendIndex(res);
        }

        if (parsed.incomplete) {
            return res.status(404).send('Repository not specified');
        }

        const { owner, repo, rest } = parsed;
        const repository = await getRepository(owner, repo);

        if (!repository) {
            return res.status(404).send('Repository not found');
        }

        const repoPath = repository.path || path.join(REPOS_BASE_PATH, owner, repo);

        if (!(await fs.pathExists(repoPath))) {
            return res.status(404).send('Repository not found');
        }

        const service = req.query.service;
        const isInfoRefs = rest === 'info/refs';

        let gitService;

        if (isInfoRefs) {
            if (!service || !service.startsWith('git-')) {
                return res.status(400).send('Bad request');
            }
            gitService = service.replace('git-', '');
        } else if (rest === 'git-upload-pack') {
            gitService = 'upload-pack';
        } else if (rest === 'git-receive-pack') {
            gitService = 'receive-pack';
        } else {
            return res.status(404).send('Not found');
        }

        if (!['upload-pack', 'receive-pack'].includes(gitService)) {
            return res.status(400).send('Unsupported git service');
        }

        if (isInfoRefs && req.method !== 'GET') {
            return res.status(405).send('Method not allowed');
        }

        if (!isInfoRefs && req.method !== 'POST') {
            return res.status(405).send('Method not allowed');
        }

        if (isInfoRefs) {
            res.setHeader(
                'Content-Type',
                `application/x-git-${gitService}-advertisement`
            );
        } else {
            res.setHeader(
                'Content-Type',
                `application/x-git-${gitService}-result`
            );
        }

        res.setHeader('Cache-Control', 'no-cache');

        const env = {
            ...process.env,
            GIT_PROTOCOL: req.headers['git-protocol'] || ''
        };

        const args = isInfoRefs
            ? [gitService, '--stateless-rpc', '--advertise-refs', repoPath]
            : [gitService, '--stateless-rpc', repoPath];

        const git = spawn('git', args, { env });

        if (isInfoRefs) {
            const serviceLine = `# service=git-${gitService}\n`;
            const length = (serviceLine.length + 4)
                .toString(16)
                .padStart(4, '0');

            res.write(length + serviceLine + '0000');
        }

        req.pipe(git.stdin);
        git.stdout.pipe(res);

        git.stderr.on('data', (data) => {
            console.error(`[git ${gitService}]`, data.toString());
        });

        git.on('close', (code) => {
            if (code !== 0) {
                console.error(`git ${gitService} exited with code ${code}`);
                return;
            }

            if (gitService === 'receive-pack') {
                Promise.all([
                    updateBranches(repository.id, repoPath),
                    extractAndStoreCommits(repository.id, repoPath)
                ]).catch((err) => {
                    console.error('Failed to update repository data:', err);
                });
            }
        });
    } catch (err) {
        console.error('Git backend error:', err);
        res.status(500).send('Git backend error');
    }
});

module.exports = router;

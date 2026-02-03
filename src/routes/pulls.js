const express = require('express');
const db = require('../database');
const { authenticateToken } = require('../middleware/auth');
const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs-extra');
const createRateLimiter = require('../utils/rate-limit');

const router = express.Router();
const REPOS_BASE_PATH = process.env.REPOS_BASE_PATH || './repos';

let workflowExecutor = null;

const pullsLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 60,
    message: 'Too many pull request requests, please try again soon.'
});

function setWorkflowExecutor(executor) {
    workflowExecutor = executor;
}

// Create a pull request
router.post('/:owner/:repo/pulls', authenticateToken, pullsLimiter, async (req, res) => {
    const { owner, repo } = req.params;
    const { title, body, head, base, head_branch, base_branch } = req.body;
    const headBranch = head || head_branch;
    const baseBranch = base || base_branch;
    const authorId = req.user.id;

    if (!title || !headBranch || !baseBranch) {
        return res.status(400).json({ error: 'Title, head branch, and base branch are required' });
    }

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

            try {
                // Verify branches exist
                const git = simpleGit(repository.path);
                const branches = await git.branch();

                if (!branches.all.includes(headBranch) || !branches.all.includes(baseBranch)) {
                    const missing = [];
                    if (!branches.all.includes(headBranch)) missing.push(headBranch);
                    if (!branches.all.includes(baseBranch)) missing.push(baseBranch);
                    return res.status(400).json({ error: `Branch not found: ${missing.join(', ')}` });
                }

                // Get next PR number
                db.get(
                    'SELECT MAX(pr_number) as max_num FROM pull_requests WHERE repo_id = ?',
                    [repository.id],
                    (err, result) => {
                        if (err) {
                            return res.status(500).json({ error: 'Database error' });
                        }

                        const prNumber = (result.max_num || 0) + 1;

                        db.run(
                            `INSERT INTO pull_requests (repo_id, pr_number, title, body, head_branch, base_branch, author_id) 
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
                            [repository.id, prNumber, title, body, headBranch, baseBranch, authorId],
                            function (err) {
                                if (err) {
                                    return res.status(500).json({ error: 'Failed to create pull request' });
                                }

                                if (workflowExecutor) {
                                    workflowExecutor.triggerWorkflowsByEvent(
                                        repository.id,
                                        repository.path,
                                        'pull_request',
                                        {
                                            type: 'pull_request',
                                            branch: baseBranch,
                                            ref: `refs/heads/${baseBranch}`,
                                            sha: '',
                                            actor: req.user.username
                                        }
                                    ).catch((error) => {
                                        console.error('Failed to trigger workflows for PR:', error);
                                    });
                                }

                                res.json({
                                    message: 'Pull request created successfully',
                                    pull_request: {
                                        id: this.lastID,
                                        number: prNumber,
                                        title,
                                        body,
                                        head_branch: headBranch,
                                        base_branch: baseBranch,
                                        state: 'open',
                                        author_id: authorId
                                    }
                                });
                            }
                        );
                    }
                );
            } catch (error) {
                console.error('Error creating PR:', error);
                res.status(500).json({ error: 'Failed to create pull request' });
            }
        }
    );
});

// Get all pull requests for a repository
    router.get('/:owner/:repo/pulls', authenticateToken, pullsLimiter, (req, res) => {
    const { owner, repo } = req.params;
    const { state = 'open', page = 1, per_page = 30 } = req.query;

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

            const offset = (page - 1) * per_page;
            let query = `
        SELECT pr.*, u.username as author_name
        FROM pull_requests pr
        JOIN users u ON pr.author_id = u.id
        WHERE pr.repo_id = ?
      `;
            const params = [repository.id];

            if (state !== 'all') {
                query += ' AND pr.state = ?';
                params.push(state);
            }

            query += ' ORDER BY pr.created_at DESC LIMIT ? OFFSET ?';
            params.push(parseInt(per_page), offset);

            db.all(query, params, (err, prs) => {
                if (err) {
                    return res.status(500).json({ error: 'Database error' });
                }

                res.json({ pull_requests: prs });
            });
        }
    );
});

// Get a specific pull request
router.get('/:owner/:repo/pulls/:number', (req, res) => {
    const { owner, repo, number } = req.params;

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

            db.get(
                `SELECT pr.*, u.username as author_name
         FROM pull_requests pr
         JOIN users u ON pr.author_id = u.id
         WHERE pr.repo_id = ? AND pr.pr_number = ?`,
                [repository.id, number],
                (err, pr) => {
                    if (err || !pr) {
                        return res.status(404).json({ error: 'Pull request not found' });
                    }

                    // Get comments
                    db.all(
                        `SELECT pc.*, u.username as author_name
             FROM pr_comments pc
             JOIN users u ON pc.author_id = u.id
             WHERE pc.pr_id = ?
             ORDER BY pc.created_at ASC`,
                        [pr.id],
                        (err, comments) => {
                            if (err) {
                                return res.status(500).json({ error: 'Database error' });
                            }

                            res.json({ pull_request: { ...pr, comments } });
                        }
                    );
                }
            );
        }
    );
});

// Merge a pull request
router.post('/:owner/:repo/pulls/:number/merge', authenticateToken, async (req, res) => {
    const { owner, repo, number } = req.params;
    const { commit_message } = req.body;
    const userId = req.user.id;

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

            db.get(
                'SELECT * FROM pull_requests WHERE repo_id = ? AND pr_number = ?',
                [repository.id, number],
                async (err, pr) => {
                    if (err || !pr) {
                        return res.status(404).json({ error: 'Pull request not found' });
                    }

                    if (pr.state !== 'open') {
                        return res.status(400).json({ error: 'Pull request is not open' });
                    }

                    try {
                        const git = simpleGit(repository.path);

                        // Checkout base branch
                        await git.checkout(pr.base_branch);

                        // Merge head branch
                        const mergeMsg = commit_message || `Merge pull request #${number} from ${pr.head_branch}`;

                        try {
                            await git.merge([pr.head_branch, '-m', mergeMsg, '--no-ff']);
                        } catch (mergeError) {
                            // Check if it's a conflict
                            await git.merge(['--abort']).catch(() => { });
                            return res.status(409).json({
                                error: 'Merge conflicts detected',
                                details: mergeError.message,
                                mergeable: false,
                                has_conflicts: true
                            });
                        }

                        // Update PR status
                        db.run(
                            `UPDATE pull_requests 
               SET state = 'closed', merged = 1, merged_at = CURRENT_TIMESTAMP, 
                   merged_by_id = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`,
                            [userId, pr.id],
                            (err) => {
                                if (err) {
                                    return res.status(500).json({ error: 'Failed to update pull request' });
                                }

                                res.json({ message: 'Pull request merged successfully', merged: true });
                            }
                        );
                    } catch (error) {
                        console.error('Merge error:', error);
                        res.status(500).json({ error: 'Failed to merge pull request', details: error.message });
                    }
                }
            );
        }
    );
});

// Check if PR is mergeable
router.get('/:owner/:repo/pulls/:number/mergeable', authenticateToken, async (req, res) => {
    const { owner, repo, number } = req.params;

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

            db.get(
                'SELECT * FROM pull_requests WHERE repo_id = ? AND pr_number = ?',
                [repository.id, number],
                async (err, pr) => {
                    if (err || !pr) {
                        return res.status(404).json({ error: 'Pull request not found' });
                    }

                    try {
                        const git = simpleGit(repository.path);

                        // Create a temporary branch to test merge
                        const testBranch = `test-merge-${Date.now()}`;
                        await git.checkoutBranch(testBranch, pr.base_branch);

                        try {
                            // Try to merge
                            await git.merge([pr.head_branch, '--no-commit', '--no-ff']);

                            // Reset the merge
                            await git.reset(['--merge']);
                            await git.checkout(pr.base_branch);
                            await git.branch(['-D', testBranch]);

                            res.json({ mergeable: true, has_conflicts: false });
                        } catch (mergeError) {
                            // Conflicts detected
                            await git.merge(['--abort']).catch(() => { });
                            await git.checkout(pr.base_branch);
                            await git.branch(['-D', testBranch]).catch(() => { });

                            res.json({ mergeable: false, has_conflicts: true });
                        }
                    } catch (error) {
                        console.error('Mergeable check error:', error);
                        res.status(500).json({ error: 'Failed to check merge status' });
                    }
                }
            );
        }
    );
});

// Get PR comments
router.get('/:owner/:repo/pulls/:number/comments', (req, res) => {
    const { owner, repo, number } = req.params;

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

            db.get(
                'SELECT id FROM pull_requests WHERE repo_id = ? AND pr_number = ?',
                [repository.id, number],
                (err, pr) => {
                    if (err || !pr) {
                        return res.status(404).json({ error: 'Pull request not found' });
                    }

                    db.all(
                        `SELECT pc.*, u.username as author_name
               FROM pr_comments pc
               JOIN users u ON pc.author_id = u.id
               WHERE pc.pr_id = ?
               ORDER BY pc.created_at ASC`,
                        [pr.id],
                        (err, comments) => {
                            if (err) {
                                return res.status(500).json({ error: 'Database error' });
                            }
                            res.json({ comments });
                        }
                    );
                }
            );
        }
    );
});

// Add comment to PR
router.post('/:owner/:repo/pulls/:number/comments', authenticateToken, (req, res) => {
    const { owner, repo, number } = req.params;
    const { body } = req.body;
    const authorId = req.user.id;

    if (!body) {
        return res.status(400).json({ error: 'Comment body is required' });
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

            db.get(
                'SELECT id FROM pull_requests WHERE repo_id = ? AND pr_number = ?',
                [repository.id, number],
                (err, pr) => {
                    if (err || !pr) {
                        return res.status(404).json({ error: 'Pull request not found' });
                    }

                    db.run(
                        'INSERT INTO pr_comments (pr_id, author_id, body) VALUES (?, ?, ?)',
                        [pr.id, authorId, body],
                        function (err) {
                            if (err) {
                                return res.status(500).json({ error: 'Failed to add comment' });
                            }

                            res.json({
                                message: 'Comment added successfully',
                                comment: {
                                    id: this.lastID,
                                    pr_id: pr.id,
                                    author_id: authorId,
                                    author_name: req.user.username,
                                    body,
                                    created_at: new Date().toISOString()
                                }
                            });
                        }
                    );
                }
            );
        }
    );
});

// Delete comment from PR
router.delete('/:owner/:repo/pulls/:number/comments/:commentId', authenticateToken, (req, res) => {
    const { owner, repo, number, commentId } = req.params;
    const userId = req.user.id;

    db.get(
        `SELECT r.*, u.username as owner_name FROM repositories r
     LEFT JOIN users u ON r.owner_id = u.id AND r.owner_type = 'user'
     LEFT JOIN organizations o ON r.owner_id = o.id AND r.owner_type = 'org'
     WHERE r.name = ? AND (u.username = ? OR o.name = ?)`,
        [repo, owner, owner],
        (err, repository) => {
            if (err || !repository) {
                return res.status(404).json({ error: 'Repository not found' });
            }

            // Check if user is admin, repo owner, or comment author
            db.get(
                `SELECT pc.*, pr.id as pr_id FROM pr_comments pc
         JOIN pull_requests pr ON pc.pr_id = pr.id
         WHERE pc.id = ? AND pr.pr_number = ? AND pr.repo_id = ?`,
                [commentId, number, repository.id],
                (err, comment) => {
                    if (err || !comment) {
                        return res.status(404).json({ error: 'Comment not found' });
                    }

                    // Check permissions
                    const isCommentAuthor = comment.author_id === userId;
                    const isRepoOwner = repository.owner_id === userId;
                    const isAdmin = req.user.is_admin === 1;

                    // Check if user is a collaborator
                    db.get(
                        'SELECT * FROM repo_collaborators WHERE repo_id = ? AND user_id = ?',
                        [repository.id, userId],
                        (err, collaborator) => {
                            const isCollaborator = !!collaborator;

                            if (!isCommentAuthor && !isRepoOwner && !isAdmin && !isCollaborator) {
                                return res.status(403).json({ error: 'You do not have permission to delete this comment' });
                            }

                            db.run(
                                'DELETE FROM pr_comments WHERE id = ?',
                                [commentId],
                                function (err) {
                                    if (err) {
                                        return res.status(500).json({ error: 'Failed to delete comment' });
                                    }
                                    res.json({ message: 'Comment deleted successfully' });
                                }
                            );
                        }
                    );
                }
            );
        }
    );
});

// Add review to PR
router.post('/:owner/:repo/pulls/:number/review', authenticateToken, (req, res) => {
    const { owner, repo, number } = req.params;
    const { event, body } = req.body;
    const reviewerId = req.user.id;

    if (!event || !['APPROVE', 'REQUEST_CHANGES', 'COMMENT'].includes(event)) {
        return res.status(400).json({ error: 'Invalid review event' });
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

            db.get(
                'SELECT id FROM pull_requests WHERE repo_id = ? AND pr_number = ?',
                [repository.id, number],
                (err, pr) => {
                    if (err || !pr) {
                        return res.status(404).json({ error: 'Pull request not found' });
                    }

                    db.run(
                        'INSERT INTO pr_reviews (pr_id, reviewer_id, state, body) VALUES (?, ?, ?, ?)',
                        [pr.id, reviewerId, event, body],
                        function (err) {
                            if (err) {
                                return res.status(500).json({ error: 'Failed to add review' });
                            }

                            res.json({
                                message: 'Review added successfully',
                                review: {
                                    id: this.lastID,
                                    pr_id: pr.id,
                                    reviewer_id: reviewerId,
                                    state: event,
                                    body,
                                    created_at: new Date().toISOString()
                                }
                            });
                        }
                    );
                }
            );
        }
    );
});

// Close pull request without merging
router.patch('/:owner/:repo/pulls/:number/close', authenticateToken, (req, res) => {
    const { owner, repo, number } = req.params;

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
                `UPDATE pull_requests SET state = 'closed', closed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
         WHERE repo_id = ? AND pr_number = ?`,
                [repository.id, number],
                function (err) {
                    if (err) {
                        return res.status(500).json({ error: 'Database error' });
                    }

                    if (this.changes === 0) {
                        return res.status(404).json({ error: 'Pull request not found' });
                    }

                    res.json({ message: 'Pull request closed successfully' });
                }
            );
        }
    );
});

module.exports = router;
module.exports.setWorkflowExecutor = setWorkflowExecutor;

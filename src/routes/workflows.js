const express = require('express');
const db = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

let workflowExecutor = null;

// This will be set by server.js
function setWorkflowExecutor(executor) {
    workflowExecutor = executor;
}

// Get all workflows for a repository
router.get('/:owner/:repo/workflows', authenticateToken, async (req, res) => {
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
                const workflows = await workflowExecutor.discoverWorkflows(repository.path);
                res.json({ workflows });
            } catch (error) {
                console.error('Failed to discover workflows:', error);
                res.status(500).json({ error: 'Failed to load workflows' });
            }
        }
    );
});

// Get workflow runs for a repository
router.get('/:owner/:repo/actions/runs', authenticateToken, async (req, res) => {
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
                const runs = await workflowExecutor.getWorkflowRuns(repository.id);
                res.json({ runs });
            } catch (error) {
                console.error('Failed to get workflow runs:', error);
                res.status(500).json({ error: 'Failed to load workflow runs' });
            }
        }
    );
});

// Get a specific workflow run
router.get('/:owner/:repo/actions/runs/:runId', authenticateToken, async (req, res) => {
    const { owner, repo, runId } = req.params;

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
                const run = await workflowExecutor.getWorkflowRun(parseInt(runId));

                // Verify run belongs to this repo
                if (run.repo_id !== repository.id) {
                    return res.status(404).json({ error: 'Workflow run not found' });
                }

                res.json({ run });
            } catch (error) {
                console.error('Failed to get workflow run:', error);
                res.status(500).json({ error: 'Failed to load workflow run' });
            }
        }
    );
});

// Manually trigger a workflow
router.post('/:owner/:repo/actions/workflows/:workflow/dispatches', authenticateToken, async (req, res) => {
    const { owner, repo, workflow } = req.params;
    const { ref = 'main', inputs = {} } = req.body;

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
                const workflows = await workflowExecutor.discoverWorkflows(repository.path);
                const targetWorkflow = workflows.find(w => w.filename === workflow || w.name === workflow);

                if (!targetWorkflow) {
                    return res.status(404).json({ error: 'Workflow not found' });
                }

                const runs = await workflowExecutor.triggerWorkflowsByEvent(
                    repository.id,
                    repository.path,
                    'workflow_dispatch',
                    {
                        type: 'workflow_dispatch',
                        ref,
                        inputs,
                        actor: req.user.username
                    }
                );

                res.json({
                    message: 'Workflow triggered successfully',
                    runs
                });
            } catch (error) {
                console.error('Failed to trigger workflow:', error);
                res.status(500).json({ error: 'Failed to trigger workflow', details: error.message });
            }
        }
    );
});

// Get logs for a specific job
router.get('/:owner/:repo/actions/runs/:runId/jobs/:jobId/logs', authenticateToken, (req, res) => {
    const { owner, repo, runId, jobId } = req.params;

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
                `SELECT wj.* FROM workflow_jobs wj
         JOIN workflow_runs wr ON wj.run_id = wr.id
         WHERE wj.id = ? AND wr.id = ? AND wr.repo_id = ?`,
                [jobId, runId, repository.id],
                (err, job) => {
                    if (err || !job) {
                        return res.status(404).json({ error: 'Job not found' });
                    }

                    res.json({ logs: job.logs || '' });
                }
            );
        }
    );
});

module.exports = router;
module.exports.setWorkflowExecutor = setWorkflowExecutor;

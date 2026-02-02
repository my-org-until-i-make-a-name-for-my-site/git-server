const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const WorkflowParser = require('./workflow-parser');
const db = require('../database');

class WorkflowExecutor {
    constructor(taskManager) {
        this.taskManager = taskManager;
        this.parser = new WorkflowParser();
        this.runningWorkflows = new Map();
    }

    /**
     * Discover all workflows in a repository
     */
    async discoverWorkflows(repoPath) {
        const workflowDir = path.join(repoPath, '.codara', 'workflows');

        if (!await fs.pathExists(workflowDir)) {
            return [];
        }

        const files = await fs.readdir(workflowDir);
        const workflows = [];

        for (const file of files) {
            if (file.endsWith('.yml') || file.endsWith('.yaml')) {
                const workflowPath = path.join(workflowDir, file);
                try {
                    const workflow = await this.parser.parseWorkflow(workflowPath);
                    workflows.push({
                        ...workflow,
                        filename: file
                    });
                } catch (error) {
                    console.error(`Failed to parse workflow ${file}:`, error);
                }
            }
        }

        return workflows;
    }

    /**
     * Trigger workflows based on an event
     */
    async triggerWorkflowsByEvent(repoId, repoPath, eventType, eventData) {
        const workflows = await this.discoverWorkflows(repoPath);
        const triggeredRuns = [];

        for (const workflow of workflows) {
            if (this.parser.shouldRunForEvent(workflow, eventType, eventData)) {
                const run = await this.executeWorkflow(repoId, repoPath, workflow, eventData);
                triggeredRuns.push(run);
            }
        }

        return triggeredRuns;
    }

    /**
     * Execute a workflow
     */
    async executeWorkflow(repoId, repoPath, workflow, eventData) {
        // Create workflow run record
        return new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO workflow_runs (repo_id, workflow_name, event, status, started_at)
         VALUES (?, ?, ?, 'running', CURRENT_TIMESTAMP)`,
                [repoId, workflow.name, eventData.type || 'manual'],
                async function (err) {
                    if (err) {
                        return reject(err);
                    }

                    const runId = this.lastID;

                    try {
                        // Execute all jobs
                        const jobPromises = [];

                        for (const [jobName, job] of Object.entries(workflow.jobs)) {
                            jobPromises.push(
                                this.executeJob(runId, jobName, job, repoPath, workflow, eventData)
                            );
                        }

                        await Promise.all(jobPromises);

                        // Update workflow run status
                        db.run(
                            `UPDATE workflow_runs 
               SET status = 'completed', completed_at = CURRENT_TIMESTAMP
               WHERE id = ?`,
                            [runId]
                        );

                        resolve({ id: runId, workflow: workflow.name, status: 'completed' });
                    } catch (error) {
                        // Update workflow run status to failed
                        db.run(
                            `UPDATE workflow_runs 
               SET status = 'failed', completed_at = CURRENT_TIMESTAMP
               WHERE id = ?`,
                            [runId]
                        );

                        reject(error);
                    }
                }.bind(this)
            );
        });
    }

    /**
     * Execute a single job
     */
    async executeJob(runId, jobName, job, repoPath, workflow, eventData) {
        return new Promise(async (resolve, reject) => {
            // Create job record
            db.run(
                `INSERT INTO workflow_jobs (run_id, job_name, status, started_at)
         VALUES (?, ?, 'running', CURRENT_TIMESTAMP)`,
                [runId, jobName],
                async function (err) {
                    if (err) {
                        return reject(err);
                    }

                    const jobId = this.lastID;
                    const logs = [];

                    try {
                        // Expand steps (resolve 'uses' directives)
                        const steps = await this.parser.expandJobSteps(job, { repoPath });

                        // Execute each step sequentially
                        for (const [stepIndex, step] of steps.entries()) {
                            const stepName = step.name || `Step ${stepIndex + 1}`;

                            logs.push(`\n>>> ${stepName}\n`);

                            if (step.run) {
                                const env = {
                                    ...process.env,
                                    ...workflow.env,
                                    ...job.env,
                                    ...step.env,
                                    CODARA_REPO_PATH: repoPath,
                                    CODARA_WORKFLOW: workflow.name,
                                    CODARA_JOB: jobName,
                                    GITHUB_REF: eventData.ref || 'refs/heads/main',
                                    GITHUB_SHA: eventData.sha || '',
                                    ...step.with
                                };

                                const output = await this.executeStep(step.run, repoPath, env);
                                logs.push(output);
                            }
                        }

                        // Update job status
                        const logsText = logs.join('');
                        db.run(
                            `UPDATE workflow_jobs 
               SET status = 'completed', completed_at = CURRENT_TIMESTAMP, logs = ?
               WHERE id = ?`,
                            [logsText, jobId]
                        );

                        resolve({ jobName, status: 'completed', logs: logsText });
                    } catch (error) {
                        const logsText = logs.join('') + `\n\nERROR: ${error.message}`;

                        db.run(
                            `UPDATE workflow_jobs 
               SET status = 'failed', completed_at = CURRENT_TIMESTAMP, logs = ?
               WHERE id = ?`,
                            [logsText, jobId]
                        );

                        reject(error);
                    }
                }.bind(this)
            );
        });
    }

    /**
     * Execute a single step
     */
    executeStep(command, cwd, env) {
        return new Promise((resolve, reject) => {
            const shell = process.platform === 'win32' ? 'powershell.exe' : '/bin/bash';
            const shellArgs = process.platform === 'win32' ? ['-Command', command] : ['-c', command];

            const proc = spawn(shell, shellArgs, { cwd, env, shell: false });

            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            proc.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            proc.on('close', (code) => {
                const output = stdout + stderr;

                if (code !== 0) {
                    reject(new Error(`Step failed with exit code ${code}\n${output}`));
                } else {
                    resolve(output);
                }
            });

            proc.on('error', (error) => {
                reject(error);
            });
        });
    }

    /**
     * Get workflow run status
     */
    getWorkflowRun(runId) {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT wr.*, 
         (SELECT json_group_array(json_object(
           'job_name', wj.job_name,
           'status', wj.status,
           'started_at', wj.started_at,
           'completed_at', wj.completed_at,
           'logs', wj.logs
         ))
         FROM workflow_jobs wj
         WHERE wj.run_id = wr.id) as jobs
         FROM workflow_runs wr
         WHERE wr.id = ?`,
                [runId],
                (err, run) => {
                    if (err) return reject(err);
                    if (!run) return reject(new Error('Workflow run not found'));

                    try {
                        run.jobs = JSON.parse(run.jobs || '[]');
                    } catch (e) {
                        run.jobs = [];
                    }

                    resolve(run);
                }
            );
        });
    }

    /**
     * Get all workflow runs for a repository
     */
    getWorkflowRuns(repoId) {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT * FROM workflow_runs 
         WHERE repo_id = ? 
         ORDER BY started_at DESC 
         LIMIT 50`,
                [repoId],
                (err, runs) => {
                    if (err) return reject(err);
                    resolve(runs || []);
                }
            );
        });
    }
}

module.exports = WorkflowExecutor;

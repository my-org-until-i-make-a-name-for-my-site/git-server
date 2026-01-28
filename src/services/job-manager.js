const fs = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');
const archiver = require('archiver');

const JOBS_BASE_PATH = process.env.JOBS_BASE_PATH || './mnt/runners/jobs';

class JobManager {
  constructor() {
    this.jobs = new Map();
    this.jobIdCounter = 0;
    this.ensureJobsDirectory();
  }

  async ensureJobsDirectory() {
    await fs.ensureDir(JOBS_BASE_PATH);
    console.log(`Jobs directory: ${JOBS_BASE_PATH}`);
  }

  async createJob(config) {
    const jobId = `job-${Date.now()}-${++this.jobIdCounter}`;
    const jobPath = path.join(JOBS_BASE_PATH, jobId);

    await fs.ensureDir(jobPath);
    await fs.ensureDir(path.join(jobPath, 'workspace'));
    await fs.ensureDir(path.join(jobPath, 'artifacts'));
    await fs.ensureDir(path.join(jobPath, 'logs'));

    const job = {
      id: jobId,
      path: jobPath,
      status: 'pending',
      config,
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      artifacts: [],
      logs: []
    };

    // Write job configuration
    await fs.writeJson(path.join(jobPath, 'job.json'), {
      id: jobId,
      config,
      createdAt: job.createdAt
    }, { spaces: 2 });

    // Create job script
    const scriptPath = path.join(jobPath, 'run.sh');
    await this.createJobScript(scriptPath, config);
    await fs.chmod(scriptPath, 0o755);

    this.jobs.set(jobId, job);
    return job;
  }

  async createJobScript(scriptPath, config) {
    const { repoPath, stage, scripts, env = {} } = config;

    let script = '#!/bin/bash\n';
    script += 'set -e\n\n';
    script += '# Job execution script\n\n';

    // Set environment variables
    script += '# Environment variables\n';
    for (const [key, value] of Object.entries(env)) {
      script += `export ${key}="${value}"\n`;
    }
    script += '\n';

    // Change to workspace
    script += '# Navigate to workspace\n';
    script += 'cd "$(dirname "$0")/workspace"\n\n';

    // Clone/copy repository if needed
    if (repoPath) {
      script += '# Copy repository\n';
      script += `cp -r "${repoPath}/." .\n\n`;
    }

    // Install dependencies if package.json exists
    script += '# Install dependencies if needed\n';
    script += 'if [ -f "package.json" ]; then\n';
    script += '  echo "Installing npm dependencies..."\n';
    script += '  npm install\n';
    script += 'fi\n\n';

    script += 'if [ -f "requirements.txt" ]; then\n';
    script += '  echo "Installing Python dependencies..."\n';
    script += '  pip install -r requirements.txt\n';
    script += 'fi\n\n';

    script += 'if [ -f "Gemfile" ]; then\n';
    script += '  echo "Installing Ruby dependencies..."\n';
    script += '  bundle install\n';
    script += 'fi\n\n';

    // Run job scripts
    script += `# Stage: ${stage}\n`;
    for (const cmd of scripts) {
      script += `echo "Running: ${cmd}"\n`;
      script += `${cmd}\n`;
    }

    script += '\n# Save artifacts\n';
    script += 'if [ -d "dist" ]; then\n';
    script += '  cp -r dist ../artifacts/\n';
    script += 'fi\n';
    script += 'if [ -d "build" ]; then\n';
    script += '  cp -r build ../artifacts/\n';
    script += 'fi\n';
    script += 'if [ -d "coverage" ]; then\n';
    script += '  cp -r coverage ../artifacts/\n';
    script += 'fi\n';

    await fs.writeFile(scriptPath, script);
  }

  async updateJobStatus(jobId, status, data = {}) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = status;
    Object.assign(job, data);

    if (status === 'running' && !job.startedAt) {
      job.startedAt = Date.now();
    }

    if (status === 'completed' || status === 'failed') {
      job.completedAt = Date.now();
    }

    // Update job.json
    const jobPath = path.join(JOBS_BASE_PATH, jobId);
    const jobJsonPath = path.join(jobPath, 'job.json');
    
    if (await fs.pathExists(jobJsonPath)) {
      const jobJson = await fs.readJson(jobJsonPath);
      jobJson.status = status;
      jobJson.startedAt = job.startedAt;
      jobJson.completedAt = job.completedAt;
      jobJson.exitCode = data.exitCode;
      await fs.writeJson(jobJsonPath, jobJson, { spaces: 2 });
    }
  }

  async appendJobLog(jobId, logData) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const logPath = path.join(JOBS_BASE_PATH, jobId, 'logs', 'output.log');
    await fs.appendFile(logPath, logData + '\n');
  }

  async getJobArtifacts(jobId) {
    const artifactsPath = path.join(JOBS_BASE_PATH, jobId, 'artifacts');
    
    if (!await fs.pathExists(artifactsPath)) {
      return [];
    }

    const files = await fs.readdir(artifactsPath, { withFileTypes: true });
    return files.map(f => ({
      name: f.name,
      isDirectory: f.isDirectory(),
      path: path.join(artifactsPath, f.name)
    }));
  }

  async archiveArtifacts(jobId) {
    const artifactsPath = path.join(JOBS_BASE_PATH, jobId, 'artifacts');
    const archivePath = path.join(JOBS_BASE_PATH, jobId, `artifacts-${jobId}.zip`);

    if (!await fs.pathExists(artifactsPath)) {
      return null;
    }

    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(archivePath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => {
        resolve(archivePath);
      });

      archive.on('error', (err) => {
        reject(err);
      });

      archive.pipe(output);
      archive.directory(artifactsPath, false);
      archive.finalize();
    });
  }

  getJob(jobId) {
    return this.jobs.get(jobId);
  }

  getAllJobs() {
    return Array.from(this.jobs.values());
  }

  async cleanupOldJobs(olderThanDays = 7) {
    const cutoffTime = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);

    for (const [jobId, job] of this.jobs.entries()) {
      if (job.completedAt && job.completedAt < cutoffTime) {
        const jobPath = path.join(JOBS_BASE_PATH, jobId);
        await fs.remove(jobPath);
        this.jobs.delete(jobId);
      }
    }
  }
}

module.exports = JobManager;

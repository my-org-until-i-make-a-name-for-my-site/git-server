require('dotenv').config();
const dgram = require('dgram');
const os = require('os');
const express = require('express');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const http = require('http');

const CLUSTER_PORT = process.env.CLUSTER_PORT || 4000;
const DISCOVERY_PORT = process.env.DISCOVERY_PORT || 4001;
const MAX_CONCURRENT_TASKS = parseInt(process.env.MAX_CONCURRENT_TASKS) || 4;
const TASK_TIMEOUT = parseInt(process.env.TASK_TIMEOUT) || 300000;
const MAX_CPU_PERCENT = parseInt(process.env.MAX_CPU_PERCENT) || 80;
const MAX_MEMORY_PERCENT = parseInt(process.env.MAX_MEMORY_PERCENT) || 80;
const CLUSTER_SECRET = process.env.CLUSTER_SECRET || 'your-cluster-secret-key';
const JOBS_BASE_PATH = process.env.JOBS_BASE_PATH || 'Z:/mnt/runners/jobs';

class ClusterAgent {
  constructor() {
    this.tasks = new Map();
    this.runningTasks = 0;
    this.taskIdCounter = 0;
    this.discoverySocket = null;
    this.wsConnections = new Set();
    
    this.info = {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus().length,
      totalMemory: os.totalmem(),
      port: CLUSTER_PORT
    };

    console.log('Codara Cluster Agent started');
    console.log(`Hostname: ${this.info.hostname}`);
    console.log(`Listening on port: ${CLUSTER_PORT}`);
    console.log(`Discovery port: ${DISCOVERY_PORT}`);
    console.log(`Jobs path: ${JOBS_BASE_PATH}`);

    this.setupHTTPServer();
    this.setupDiscovery();
  }
  }

  setupHTTPServer() {
    const app = express();
    app.use(express.json());

    // Middleware to check cluster secret
    app.use((req, res, next) => {
      const secret = req.headers['x-cluster-secret'];
      if (secret !== CLUSTER_SECRET && req.path !== '/health' && req.path !== '/stats') {
        return res.status(403).json({ error: 'Invalid cluster secret' });
      }
      next();
    });

    // Health check
    app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy',
        hostname: this.info.hostname,
        uptime: os.uptime()
      });
    });

    // System stats
    app.get('/stats', (req, res) => {
      res.json(this.getSystemStats());
    });

    // Execute task
    app.post('/execute', async (req, res) => {
      const { command, args = [], cwd, env = {} } = req.body;

      if (!command) {
        return res.status(400).json({ error: 'Command is required' });
      }

      // Check if we can accept more tasks
      if (this.runningTasks >= MAX_CONCURRENT_TASKS) {
        return res.status(503).json({ error: 'Max concurrent tasks reached' });
      }

      // Check resource availability
      const stats = this.getSystemStats();
      if (stats.memoryUsagePercent > MAX_MEMORY_PERCENT || stats.cpu > (MAX_CPU_PERCENT / 10)) {
        return res.status(503).json({ error: 'Insufficient resources' });
      }

      const taskId = ++this.taskIdCounter;
      const task = {
        id: taskId,
        command,
        args,
        cwd,
        env,
        status: 'running',
        startedAt: Date.now()
      };

      this.tasks.set(taskId, task);
      this.runningTasks++;

      // Execute task asynchronously
      this.executeTask(task).catch(err => {
        console.error(`Task ${taskId} error:`, err);
      });

      res.json({ taskId, status: 'started' });
    });

    // Execute job (reads from shared job directory)
    app.post('/execute-job', async (req, res) => {
      const { jobId, jobPath } = req.body;

      if (!jobId) {
        return res.status(400).json({ error: 'jobId is required' });
      }

      // Check if we can accept more tasks
      if (this.runningTasks >= MAX_CONCURRENT_TASKS) {
        return res.status(503).json({ error: 'Max concurrent tasks reached' });
      }

      // Check resource availability
      const stats = this.getSystemStats();
      if (stats.memoryUsagePercent > MAX_MEMORY_PERCENT || stats.cpu > (MAX_CPU_PERCENT / 10)) {
        return res.status(503).json({ error: 'Insufficient resources' });
      }

      const taskId = ++this.taskIdCounter;
      const task = {
        id: taskId,
        jobId,
        jobPath: jobPath || `${JOBS_BASE_PATH}/${jobId}`,
        status: 'running',
        startedAt: Date.now()
      };

      this.tasks.set(taskId, task);
      this.runningTasks++;

      // Execute job asynchronously
      this.executeJob(task).catch(err => {
        console.error(`Job ${jobId} error:`, err);
      });

      res.json({ taskId, jobId, status: 'started' });
    });

    // Get task status
    app.get('/task/:id', (req, res) => {
      const taskId = parseInt(req.params.id);
      const task = this.tasks.get(taskId);

      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }

      res.json(task);
    });

    // Get all tasks
    app.get('/tasks', (req, res) => {
      res.json({
        tasks: Array.from(this.tasks.values()),
        running: this.runningTasks,
        capacity: MAX_CONCURRENT_TASKS
      });
    });

    // Cancel task
    app.post('/task/:id/cancel', (req, res) => {
      const taskId = parseInt(req.params.id);
      const task = this.tasks.get(taskId);

      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }

      if (task.process) {
        task.process.kill('SIGTERM');
        task.status = 'cancelled';
        res.json({ message: 'Task cancelled' });
      } else {
        res.status(400).json({ error: 'Task cannot be cancelled' });
      }
    });

    const server = http.createServer(app);

    // WebSocket for real-time updates
    const wss = new WebSocket.Server({ server });
    
    wss.on('connection', (ws) => {
      console.log('WebSocket client connected');
      this.wsConnections.add(ws);

      ws.on('close', () => {
        this.wsConnections.delete(ws);
      });

      ws.on('error', (err) => {
        console.error('WebSocket error:', err);
        this.wsConnections.delete(ws);
      });
    });

    server.listen(CLUSTER_PORT, () => {
      console.log(`HTTP API listening on port ${CLUSTER_PORT}`);
    });
  }

  setupDiscovery() {
    this.discoverySocket = dgram.createSocket('udp4');

    this.discoverySocket.on('error', (err) => {
      console.error('Discovery socket error:', err);
    });

    this.discoverySocket.on('message', (msg, rinfo) => {
      // We can receive discovery requests here if needed
    });

    this.discoverySocket.on('listening', () => {
      const address = this.discoverySocket.address();
      console.log(`Discovery listening on ${address.address}:${address.port}`);
      this.discoverySocket.setBroadcast(true);
    });

    this.discoverySocket.bind(DISCOVERY_PORT);

    // Announce ourselves every 5 seconds
    setInterval(() => {
      this.announce();
    }, 5000);

    // Send stats every 10 seconds
    setInterval(() => {
      this.announceStats();
    }, 10000);

    // Initial announcement
    setTimeout(() => this.announce(), 100);
  }

  announce() {
    const message = JSON.stringify({
      type: 'cluster_announce',
      ...this.info,
      timestamp: Date.now()
    });

    this.broadcast(message);
  }

  announceStats() {
    const message = JSON.stringify({
      type: 'cluster_stats',
      hostname: this.info.hostname,
      port: this.info.port,
      stats: this.getSystemStats(),
      timestamp: Date.now()
    });

    this.broadcast(message);
  }

  broadcast(message) {
    const broadcastAddresses = [
      '255.255.255.255',
      '224.0.0.1'
    ];

    broadcastAddresses.forEach(addr => {
      this.discoverySocket.send(message, 0, message.length, DISCOVERY_PORT, addr, (err) => {
        if (err && err.code !== 'EACCES') {
          // Ignore permission errors
        }
      });
    });
  }

  getSystemStats() {
    const loadavg = os.loadavg();
    const freemem = os.freemem();
    const totalmem = os.totalmem();
    
    return {
      cpu: loadavg[0],
      memoryUsed: totalmem - freemem,
      memoryFree: freemem,
      memoryTotal: totalmem,
      memoryUsagePercent: ((totalmem - freemem) / totalmem) * 100,
      uptime: os.uptime(),
      runningTasks: this.runningTasks,
      maxTasks: MAX_CONCURRENT_TASKS,
      availableSlots: MAX_CONCURRENT_TASKS - this.runningTasks
    };
  }

  async executeTask(task) {
    return new Promise((resolve, reject) => {
      const env = { ...process.env, ...task.env };
      
      const proc = spawn(task.command, task.args, {
        cwd: task.cwd || process.cwd(),
        env,
        shell: false,
        timeout: TASK_TIMEOUT
      });

      task.process = proc;
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        
        // Send real-time updates via WebSocket
        this.broadcastTaskUpdate(task.id, 'output', chunk);
      });

      proc.stderr.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;
        
        this.broadcastTaskUpdate(task.id, 'error', chunk);
      });

      proc.on('close', (code, signal) => {
        this.runningTasks--;
        
        task.status = code === 0 ? 'completed' : 'failed';
        task.exitCode = code;
        task.signal = signal;
        task.stdout = stdout;
        task.stderr = stderr;
        task.completedAt = Date.now();
        task.duration = task.completedAt - task.startedAt;
        delete task.process;

        this.broadcastTaskUpdate(task.id, 'completed', {
          status: task.status,
          exitCode: code,
          duration: task.duration
        });

        console.log(`Task ${task.id} completed with exit code ${code}`);
        resolve(task);
      });

      proc.on('error', (error) => {
        this.runningTasks--;
        
        task.status = 'failed';
        task.error = error.message;
        task.completedAt = Date.now();
        task.duration = task.completedAt - task.startedAt;
        delete task.process;

        this.broadcastTaskUpdate(task.id, 'failed', { error: error.message });

        console.error(`Task ${task.id} error:`, error);
        reject(error);
      });
    });
  }

  async executeJob(task) {
    const fs = require('fs');
    const path = require('path');

    return new Promise((resolve, reject) => {
      // Check if job directory exists
      if (!fs.existsSync(task.jobPath)) {
        this.runningTasks--;
        task.status = 'failed';
        task.error = 'Job directory not found';
        task.completedAt = Date.now();
        reject(new Error('Job directory not found'));
        return;
      }

      const scriptPath = path.join(task.jobPath, 'run.sh');
      
      if (!fs.existsSync(scriptPath)) {
        this.runningTasks--;
        task.status = 'failed';
        task.error = 'Job script not found';
        task.completedAt = Date.now();
        reject(new Error('Job script not found'));
        return;
      }

      // Read job config if exists
      const jobConfigPath = path.join(task.jobPath, 'job.json');
      let jobConfig = {};
      if (fs.existsSync(jobConfigPath)) {
        jobConfig = JSON.parse(fs.readFileSync(jobConfigPath, 'utf8'));
      }

      // Update job status
      jobConfig.status = 'running';
      jobConfig.clusterId = os.hostname();
      fs.writeFileSync(jobConfigPath, JSON.stringify(jobConfig, null, 2));

      // Execute the job script
      const logPath = path.join(task.jobPath, 'logs', 'output.log');
      const logStream = fs.createWriteStream(logPath, { flags: 'a' });

      const proc = spawn('/bin/bash', [scriptPath], {
        cwd: task.jobPath,
        env: { ...process.env, ...jobConfig.env },
        shell: false,
        timeout: TASK_TIMEOUT
      });

      task.process = proc;
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        logStream.write(chunk);
        
        // Send real-time updates via WebSocket
        this.broadcastTaskUpdate(task.id, 'output', chunk);
      });

      proc.stderr.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;
        logStream.write(`[STDERR] ${chunk}`);
        
        this.broadcastTaskUpdate(task.id, 'error', chunk);
      });

      proc.on('close', (code, signal) => {
        this.runningTasks--;
        logStream.end();
        
        task.status = code === 0 ? 'completed' : 'failed';
        task.exitCode = code;
        task.signal = signal;
        task.stdout = stdout;
        task.stderr = stderr;
        task.completedAt = Date.now();
        task.duration = task.completedAt - task.startedAt;
        delete task.process;

        // Update job config with final status
        jobConfig.status = task.status;
        jobConfig.exitCode = code;
        jobConfig.completedAt = task.completedAt;
        jobConfig.duration = task.duration;
        fs.writeFileSync(jobConfigPath, JSON.stringify(jobConfig, null, 2));

        this.broadcastTaskUpdate(task.id, 'completed', {
          status: task.status,
          exitCode: code,
          duration: task.duration,
          jobId: task.jobId
        });

        console.log(`Job ${task.jobId} completed with exit code ${code}`);
        resolve(task);
      });

      proc.on('error', (error) => {
        this.runningTasks--;
        logStream.end();
        
        task.status = 'failed';
        task.error = error.message;
        task.completedAt = Date.now();
        task.duration = task.completedAt - task.startedAt;
        delete task.process;

        // Update job config
        jobConfig.status = 'failed';
        jobConfig.error = error.message;
        jobConfig.completedAt = task.completedAt;
        fs.writeFileSync(jobConfigPath, JSON.stringify(jobConfig, null, 2));

        this.broadcastTaskUpdate(task.id, 'failed', { 
          error: error.message,
          jobId: task.jobId 
        });

        console.error(`Job ${task.jobId} error:`, error);
        reject(error);
      });
    });
  }

  broadcastTaskUpdate(taskId, event, data) {
    const message = JSON.stringify({
      type: 'task_update',
      taskId,
      event,
      data,
      timestamp: Date.now()
    });

    this.wsConnections.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }
}

// Start the agent
const agent = new ClusterAgent();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down cluster agent...');
  if (agent.discoverySocket) {
    agent.discoverySocket.close();
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down cluster agent...');
  if (agent.discoverySocket) {
    agent.discoverySocket.close();
  }
  process.exit(0);
});

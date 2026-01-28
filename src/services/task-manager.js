const Queue = require('bull');
const { spawn } = require('child_process');
const path = require('path');

const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 0,
  retryStrategy: () => null // Disable retry to fall back to in-memory
};

// Try to use Redis, fall back to in-memory if not available
let taskQueue = null;
let useRedis = false;

// Only try Redis if explicitly enabled
if (process.env.USE_REDIS === 'true') {
  try {
    taskQueue = new Queue('tasks', { redis: REDIS_CONFIG });
    
    taskQueue.on('ready', () => {
      useRedis = true;
      console.log('Redis connected for task queue');
    });
    
    taskQueue.on('error', (error) => {
      console.warn('Redis error, using in-memory task queue:', error.message);
      useRedis = false;
    });
  } catch (error) {
    console.warn('Redis not available, using in-memory task queue');
    useRedis = false;
    taskQueue = null;
  }
} else {
  console.log('Using in-memory task queue (set USE_REDIS=true to enable Redis)');
}

class TaskManager {
  constructor(clusterDiscovery) {
    this.clusterDiscovery = clusterDiscovery;
    this.tasks = new Map();
    this.taskIdCounter = 0;
    this.queue = taskQueue;
    
    if (this.queue) {
      this.setupQueueProcessor();
    }
  }

  setupQueueProcessor() {
    this.queue.process(async (job) => {
      const { taskId, command, args, cwd, clusterId } = job.data;
      
      return await this.executeTask(taskId, command, args, cwd, clusterId);
    });

    this.queue.on('completed', (job, result) => {
      const task = this.tasks.get(job.data.taskId);
      if (task) {
        task.status = 'completed';
        task.result = result;
        task.completedAt = Date.now();
      }
    });

    this.queue.on('failed', (job, err) => {
      const task = this.tasks.get(job.data.taskId);
      if (task) {
        task.status = 'failed';
        task.error = err.message;
        task.completedAt = Date.now();
      }
    });
  }

  async addTask(command, args = [], cwd = null, options = {}) {
    const taskId = ++this.taskIdCounter;
    
    const task = {
      id: taskId,
      command,
      args,
      cwd,
      status: 'pending',
      createdAt: Date.now(),
      clusterId: null,
      result: null,
      error: null,
      userId: options.userId || null,
      requireHighPower: options.requireHighPower || false
    };

    this.tasks.set(taskId, task);

    // Find best cluster or use local
    const cluster = this.clusterDiscovery ? 
      this.clusterDiscovery.getBestCluster(task.requireHighPower) : null;
    
    if (cluster && options.allowCluster !== false) {
      task.clusterId = cluster.id;
      task.status = 'queued';
      
      if (this.queue && useRedis) {
        // Add to Bull queue
        await this.queue.add({
          taskId,
          command,
          args,
          cwd,
          clusterId: cluster.id
        }, {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000
          }
        });
      } else {
        // Execute immediately without queue
        setImmediate(() => {
          this.executeTask(taskId, command, args, cwd, cluster.id);
        });
      }
    } else {
      // Execute locally
      task.status = 'running';
      setImmediate(() => {
        this.executeTask(taskId, command, args, cwd, null);
      });
    }

    return task;
  }

  async executeTask(taskId, command, args, cwd, clusterId) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    task.status = 'running';
    task.startedAt = Date.now();

    return new Promise((resolve, reject) => {
      const process = spawn(command, args, {
        cwd: cwd || '/tmp',
        shell: false,
        timeout: 300000 // 5 minute timeout
      });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        const result = {
          exitCode: code,
          stdout,
          stderr,
          duration: Date.now() - task.startedAt
        };

        task.result = result;
        task.status = code === 0 ? 'completed' : 'failed';
        task.completedAt = Date.now();

        if (code === 0) {
          resolve(result);
        } else {
          reject(new Error(`Task failed with exit code ${code}`));
        }
      });

      process.on('error', (error) => {
        task.status = 'failed';
        task.error = error.message;
        task.completedAt = Date.now();
        reject(error);
      });
    });
  }

  getTask(taskId) {
    return this.tasks.get(taskId);
  }

  getAllTasks() {
    return Array.from(this.tasks.values());
  }

  async getQueueStats() {
    if (!this.queue || !useRedis) {
      return {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0
      };
    }

    const [waiting, active, completed, failed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount()
    ]);

    return { waiting, active, completed, failed };
  }
}

module.exports = TaskManager;

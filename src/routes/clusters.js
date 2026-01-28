const express = require('express');
const { authenticateToken, isAdmin } = require('../middleware/auth');

const router = express.Router();

let clusterDiscovery = null;
let taskManager = null;

// This will be set by server.js
function setServices(discovery, tasks) {
  clusterDiscovery = discovery;
  taskManager = tasks;
}

// Discover clusters
router.get('/discover', authenticateToken, (req, res) => {
  if (!clusterDiscovery) {
    return res.status(503).json({ error: 'Cluster discovery not enabled' });
  }

  const clusters = clusterDiscovery.getClusters();
  res.json({ clusters });
});

// Get cluster stats
router.get('/stats', authenticateToken, (req, res) => {
  if (!clusterDiscovery) {
    return res.status(503).json({ error: 'Cluster discovery not enabled' });
  }

  const clusters = clusterDiscovery.getClusters();
  const summary = {
    total: clusters.length,
    online: clusters.filter(c => c.stats).length,
    totalCPUs: clusters.reduce((sum, c) => sum + (c.cpus || 0), 0),
    totalMemory: clusters.reduce((sum, c) => sum + (c.totalMemory || 0), 0),
    runningTasks: clusters.reduce((sum, c) => sum + (c.stats?.runningTasks || 0), 0),
    availableSlots: clusters.reduce((sum, c) => sum + (c.stats?.availableSlots || 0), 0)
  };

  res.json({ clusters, summary });
});

// Execute task on cluster
router.post('/execute', authenticateToken, isAdmin, async (req, res) => {
  const { command, args = [], cwd, clusterId } = req.body;

  if (!command) {
    return res.status(400).json({ error: 'Command is required' });
  }

  if (!taskManager) {
    return res.status(503).json({ error: 'Task manager not available' });
  }

  try {
    const task = await taskManager.addTask(command, args, cwd, {
      allowCluster: true,
      preferredCluster: clusterId
    });

    res.json({ task });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get task status
router.get('/task/:id', authenticateToken, (req, res) => {
  const taskId = parseInt(req.params.id);

  if (!taskManager) {
    return res.status(503).json({ error: 'Task manager not available' });
  }

  const task = taskManager.getTask(taskId);
  
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  res.json({ task });
});

// Get all tasks
router.get('/tasks', authenticateToken, async (req, res) => {
  if (!taskManager) {
    return res.status(503).json({ error: 'Task manager not available' });
  }

  const tasks = taskManager.getAllTasks();
  const stats = await taskManager.getQueueStats();

  res.json({ tasks, stats });
});

module.exports = router;
module.exports.setServices = setServices;

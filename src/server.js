require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');
const http = require('http');

// Initialize database
require('./database');

// Import routes
const authRoutes = require('./routes/auth');
const orgRoutes = require('./routes/organizations');
const repoRoutes = require('./routes/repositories');
const gitRoutes = require('./routes/git');
const agentRoutes = require('./routes/agent');
const clusterRoutes = require('./routes/clusters');
const cicdRoutes = require('./routes/cicd');
const permissionsRoutes = require('./routes/permissions');

// Import services
const ClusterDiscovery = require('./services/cluster-discovery');
const ClusterManager = require('./services/cluster-manager');
const TaskManager = require('./services/task-manager');
const CollaborationService = require('./services/collaboration');
const { CIPipeline, CDPipeline } = require('./services/cicd');
const JobManager = require('./services/job-manager');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// Initialize services
let clusterDiscovery = null;
let clusterManager = null;
let taskManager = null;
let collaborationService = null;
let ciPipeline = null;
let cdPipeline = null;
let jobManager = null;

// Start cluster discovery if enabled
if (process.env.ENABLE_CLUSTER_DISCOVERY === 'true') {
  clusterDiscovery = new ClusterDiscovery(parseInt(process.env.CLUSTER_DISCOVERY_PORT) || 4001);
  clusterDiscovery.start();
  
  clusterDiscovery.on('cluster_discovered', (cluster) => {
    console.log(`Cluster discovered: ${cluster.id} at ${cluster.address}`);
  });
  
  clusterDiscovery.on('cluster_lost', (cluster) => {
    console.log(`Cluster lost: ${cluster.id}`);
  });

  // Initialize cluster manager
  clusterManager = new ClusterManager(clusterDiscovery, process.env.CLUSTER_SECRET);
}

// Initialize task manager
taskManager = new TaskManager(clusterDiscovery);

// Initialize job manager
jobManager = new JobManager();

// Initialize collaboration service (WebSocket)
collaborationService = new CollaborationService(server);

// Initialize CI/CD pipelines
ciPipeline = new CIPipeline(taskManager, collaborationService, clusterManager);
cdPipeline = new CDPipeline(taskManager, collaborationService, clusterManager);

// Set services in route modules
clusterRoutes.setServices(clusterDiscovery, taskManager);
cicdRoutes.setServices(ciPipeline, cdPipeline);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/organizations', orgRoutes);
app.use('/api/repositories', repoRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/clusters', clusterRoutes);
app.use('/api/cicd', cicdRoutes);
app.use('/api/permissions', permissionsRoutes);

// Git HTTP backend
app.use('/git', gitRoutes);

// Serve frontend for all other routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

server.listen(PORT, () => {
  console.log(`Codara platform running on http://localhost:${PORT}`);
  console.log(`Git clone URL format: http://localhost:${PORT}/git/{owner}/{repo}`);
  if (clusterDiscovery) {
    console.log('Cluster discovery enabled');
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down Codara platform...');
  
  if (clusterDiscovery) {
    clusterDiscovery.stop();
  }
  
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\nShutting down Codara platform...');
  
  if (clusterDiscovery) {
    clusterDiscovery.stop();
  }
  
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

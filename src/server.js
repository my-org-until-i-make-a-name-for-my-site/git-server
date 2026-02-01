require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');
const http = require('http');
const { getConfig } = require('./utils/config');
const fs = require('fs');

// Load configuration
const config = getConfig();
console.log('Application configuration loaded');

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
const adminRoutes = require('./routes/admin');
const profileRoutes = require('./routes/profile');
const moderatorRoutes = require('./routes/moderator');
const issuesRoutes = require('./routes/issues');
const pullsRoutes = require('./routes/pulls');
const commitsRoutes = require('./routes/commits');
const editorRoutes = require('./routes/editor');
const searchRoutes = require('./routes/search');
const exploreRoutes = require('./routes/explore');
const notificationsRoutes = require('./routes/notifications');
const bansRoutes = require('./routes/bans');

// Import middleware
const { checkIpBan } = require('./middleware/ban');

// Import services
const ClusterDiscovery = require('./services/cluster-discovery');
const ClusterManager = require('./services/cluster-manager');
const TaskManager = require('./services/task-manager');
const CollaborationService = require('./services/collaboration');
const { CIPipeline, CDPipeline } = require('./services/cicd');
const JobManager = require('./services/job-manager');

const app = express();
const server = http.createServer(app);
const PORT = config.get('server', 'port', process.env.PORT || 3000);

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

// IP ban check middleware (applied globally)
app.use(checkIpBan);

app.use(express.static(path.join(__dirname, '../dist')));
const distPath = path.join(__dirname, '../dist');

app.get(/(.*)/, (req, res, next) => {
    if (req.path === '/git' || req.path.startsWith('/git/') || req.path.includes('.git')) {
        return next();
    }
    const filePath = path.join(distPath, req.path);

    if (fs.existsSync(filePath)) {
        return res.sendFile(filePath);
    }

    // If not a React file, try API
    if (req.path.startsWith('/api')) {
        return next();
    }

    // Otherwise load React app
    res.sendFile(path.join(distPath, 'index.html'));
});

// Initialize services
let clusterDiscovery = null;
let clusterManager = null;
let taskManager = null;
let collaborationService = null;
let ciPipeline = null;
let cdPipeline = null;
let jobManager = null;

// Start cluster discovery if enabled
if (config.get('clusters', 'enable_discovery', process.env.ENABLE_CLUSTER_DISCOVERY === 'true')) {
    clusterDiscovery = new ClusterDiscovery(config.get('clusters', 'discovery_port', parseInt(process.env.CLUSTER_DISCOVERY_PORT) || 4001));
    clusterDiscovery.start();

    clusterDiscovery.on('cluster_discovered', (cluster) => {
        console.log(`Cluster discovered: ${cluster.id} at ${cluster.address}`);
    });

    clusterDiscovery.on('cluster_lost', (cluster) => {
        console.log(`Cluster lost: ${cluster.id}`);
    });

    // Initialize cluster manager
    clusterManager = new ClusterManager(clusterDiscovery, config.get('clusters', 'cluster_secret', process.env.CLUSTER_SECRET));
}

// Initialize task manager
taskManager = new TaskManager(clusterDiscovery);

// Initialize job manager
jobManager = new JobManager();

// Initialize collaboration service (WebSocket)
collaborationService = new CollaborationService(server);

// Initialize CI/CD pipelines
// ciPipeline = new CIPipeline(taskManager, collaborationService, clusterManager);
// cdPipeline = new CDPipeline(taskManager, collaborationService, clusterManager);

// Set services in route modules
clusterRoutes.setServices(clusterDiscovery, taskManager);
// cicdRoutes.setServices(ciPipeline, cdPipeline);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/organizations', orgRoutes);
app.use('/api/repositories', repoRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/clusters', clusterRoutes);
// app.use('/api/cicd', cicdRoutes);
app.use('/api/permissions', permissionsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/moderator', moderatorRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/explore', exploreRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/bans', bansRoutes);
app.use('/api', issuesRoutes);
app.use('/api', pullsRoutes);
app.use('/api', commitsRoutes);
app.use('/api', editorRoutes);

// Config API endpoint
app.get('/api/config', (req, res) => {
    // Return public config (not secrets)
    const publicConfig = {
        appName: config.get('general', 'app_name', 'Codara'),
        version: config.get('general', 'version', '1.0.0'),
        features: config.getSection('features'),
        allowUserRegistration: config.get('admin', 'allow_user_registration', true)
    };
    res.json(publicConfig);
});

// Git HTTP backend
app.use('/', gitRoutes);

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

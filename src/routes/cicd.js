const express = require('express');
const path = require('path');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

let ciPipeline = null;
let cdPipeline = null;

// This will be set by server.js
function setServices(ci, cd) {
  ciPipeline = ci;
  cdPipeline = cd;
}

// Run CI pipeline
router.post('/pipeline/run', authenticateToken, async (req, res) => {
  const { projectId, repoPath, trigger = 'manual' } = req.body;

  if (!projectId || !repoPath) {
    return res.status(400).json({ error: 'projectId and repoPath are required' });
  }

  if (!ciPipeline) {
    return res.status(503).json({ error: 'CI/CD service not available' });
  }

  try {
    // Run pipeline asynchronously
    ciPipeline.runPipeline(projectId, repoPath, trigger).catch(err => {
      console.error('Pipeline error:', err);
    });

    res.json({ message: 'Pipeline started', projectId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get pipeline status
router.get('/pipeline/:id', authenticateToken, (req, res) => {
  const pipelineId = parseInt(req.params.id);

  if (!ciPipeline) {
    return res.status(503).json({ error: 'CI/CD service not available' });
  }

  const pipeline = ciPipeline.getPipeline(pipelineId);

  if (!pipeline) {
    return res.status(404).json({ error: 'Pipeline not found' });
  }

  res.json({ pipeline });
});

// Get project pipelines
router.get('/project/:projectId/pipelines', authenticateToken, (req, res) => {
  const { projectId } = req.params;

  if (!ciPipeline) {
    return res.status(503).json({ error: 'CI/CD service not available' });
  }

  const pipelines = ciPipeline.getProjectPipelines(projectId);
  res.json({ pipelines });
});

// Deploy
router.post('/deploy', authenticateToken, async (req, res) => {
  const { projectId, repoPath, environment = 'production', config = {} } = req.body;

  if (!projectId || !repoPath) {
    return res.status(400).json({ error: 'projectId and repoPath are required' });
  }

  if (!cdPipeline) {
    return res.status(503).json({ error: 'CI/CD service not available' });
  }

  try {
    // Deploy asynchronously
    cdPipeline.deploy(projectId, repoPath, environment, config).catch(err => {
      console.error('Deployment error:', err);
    });

    res.json({ message: 'Deployment started', projectId, environment });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get deployment status
router.get('/deployment/:id', authenticateToken, (req, res) => {
  const deploymentId = parseInt(req.params.id);

  if (!cdPipeline) {
    return res.status(503).json({ error: 'CI/CD service not available' });
  }

  const deployment = cdPipeline.getDeployment(deploymentId);

  if (!deployment) {
    return res.status(404).json({ error: 'Deployment not found' });
  }

  res.json({ deployment });
});

// Get project deployments
router.get('/project/:projectId/deployments', authenticateToken, (req, res) => {
  const { projectId } = req.params;

  if (!cdPipeline) {
    return res.status(503).json({ error: 'CI/CD service not available' });
  }

  const deployments = cdPipeline.getProjectDeployments(projectId);
  res.json({ deployments });
});

module.exports = router;
module.exports.setServices = setServices;

const fs = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');

class CIPipeline {
  constructor(taskManager, collaborationService, clusterManager = null) {
    this.taskManager = taskManager;
    this.collaborationService = collaborationService;
    this.clusterManager = clusterManager;
    this.pipelines = new Map();
    this.pipelineIdCounter = 0;
  }

  async loadPipelineConfig(repoPath) {
    const configPath = path.join(repoPath, '.codara.yml');
    
    if (!await fs.pathExists(configPath)) {
      // Default pipeline
      return {
        stages: ['test', 'build'],
        jobs: {
          test: {
            script: ['npm test']
          },
          build: {
            script: ['npm run build']
          }
        }
      };
    }

    const configContent = await fs.readFile(configPath, 'utf8');
    return yaml.load(configContent);
  }

  async runPipeline(projectId, repoPath, trigger = 'manual') {
    const pipelineId = ++this.pipelineIdCounter;
    
    const pipeline = {
      id: pipelineId,
      projectId,
      status: 'running',
      trigger,
      stages: [],
      startedAt: Date.now(),
      completedAt: null
    };

    this.pipelines.set(pipelineId, pipeline);

    // Broadcast pipeline started
    this.broadcastPipelineEvent(projectId, 'pipeline_started', {
      pipelineId,
      trigger,
      startedAt: pipeline.startedAt
    });

    try {
      const config = await this.loadPipelineConfig(repoPath);
      
      // Execute stages sequentially
      for (const stage of config.stages) {
        this.broadcastPipelineEvent(projectId, 'stage_started', {
          pipelineId,
          stage,
          timestamp: Date.now()
        });

        const stageResult = await this.runStage(stage, config.jobs[stage], repoPath, pipelineId, projectId);
        pipeline.stages.push(stageResult);
        
        this.broadcastPipelineEvent(projectId, 'stage_completed', {
          pipelineId,
          stage,
          status: stageResult.status,
          duration: stageResult.completedAt - stageResult.startedAt
        });

        if (stageResult.status === 'failed') {
          pipeline.status = 'failed';
          break;
        }
      }

      if (pipeline.status === 'running') {
        pipeline.status = 'passed';
      }
    } catch (error) {
      pipeline.status = 'failed';
      pipeline.error = error.message;
      
      this.broadcastPipelineEvent(projectId, 'pipeline_error', {
        pipelineId,
        error: error.message
      });
    }

    pipeline.completedAt = Date.now();
    
    // Notify users via websocket
    this.broadcastPipelineEvent(projectId, 'pipeline_completed', {
      pipelineId,
      status: pipeline.status,
      duration: pipeline.completedAt - pipeline.startedAt
    });

    return pipeline;
  }

  async runStage(stageName, stageConfig, repoPath, pipelineId, projectId) {
    const stage = {
      name: stageName,
      status: 'running',
      jobs: [],
      startedAt: Date.now()
    };

    try {
      // Run jobs in parallel if configured
      const jobPromises = [];

      for (let i = 0; i < stageConfig.script.length; i++) {
        const script = stageConfig.script[i];
        const [command, ...args] = script.split(' ');
        
        const jobPromise = this.executeJobWithLogs(
          command,
          args,
          repoPath,
          pipelineId,
          projectId,
          stageName,
          i
        );
        
        jobPromises.push(jobPromise);
      }

      const jobs = await Promise.all(jobPromises);
      stage.jobs = jobs;

      // Check if any job failed
      const failed = jobs.some(job => job.status === 'failed');
      stage.status = failed ? 'failed' : 'passed';
    } catch (error) {
      stage.status = 'failed';
      stage.error = error.message;
    }

    stage.completedAt = Date.now();
    
    return stage;
  }

  async executeJobWithLogs(command, args, cwd, pipelineId, projectId, stageName, jobIndex) {
    const task = await this.taskManager.addTask(command, args, cwd, {
      allowCluster: true
    });

    // Subscribe to live logs if using cluster
    if (task.clusterId && this.clusterManager) {
      const clusterId = task.clusterId;
      
      // Subscribe to task updates from cluster
      this.clusterManager.subscribeToTaskUpdates(clusterId, task.id, (event, data) => {
        // Broadcast logs to clients
        this.broadcastPipelineEvent(projectId, 'job_log', {
          pipelineId,
          stage: stageName,
          jobIndex,
          taskId: task.id,
          event,
          data,
          timestamp: Date.now()
        });
      });
    }

    // Wait for task completion
    await this.waitForTask(task.id);
    
    const completedTask = this.taskManager.getTask(task.id);
    
    // Cleanup subscription
    if (task.clusterId && this.clusterManager) {
      this.clusterManager.unsubscribeFromTaskUpdates(task.clusterId, task.id);
    }

    return completedTask;
  }

  async waitForTask(taskId, timeout = 300000) {
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
      const interval = setInterval(() => {
        const task = this.taskManager.getTask(taskId);
        
        if (task.status === 'completed' || task.status === 'failed') {
          clearInterval(interval);
          resolve(task);
        }
        
        if (Date.now() - startTime > timeout) {
          clearInterval(interval);
          reject(new Error('Task timeout'));
        }
      }, 500);
    });
  }

  broadcastPipelineEvent(projectId, event, data) {
    if (this.collaborationService) {
      this.collaborationService.broadcastToProject(projectId, event, data);
    }
  }

  getPipeline(pipelineId) {
    return this.pipelines.get(pipelineId);
  }

  getProjectPipelines(projectId) {
    return Array.from(this.pipelines.values())
      .filter(p => p.projectId === projectId)
      .sort((a, b) => b.startedAt - a.startedAt);
  }
}

class CDPipeline {
  constructor(taskManager, collaborationService, clusterManager = null) {
    this.taskManager = taskManager;
    this.collaborationService = collaborationService;
    this.clusterManager = clusterManager;
    this.deployments = new Map();
    this.deploymentIdCounter = 0;
  }

  async deploy(projectId, repoPath, environment = 'production', config = {}) {
    const deploymentId = ++this.deploymentIdCounter;
    
    const deployment = {
      id: deploymentId,
      projectId,
      environment,
      status: 'deploying',
      startedAt: Date.now(),
      completedAt: null
    };

    this.deployments.set(deploymentId, deployment);

    // Broadcast deployment started
    this.broadcastDeploymentEvent(projectId, 'deployment_started', {
      deploymentId,
      environment,
      startedAt: deployment.startedAt
    });

    try {
      // Run deployment script
      const deployScript = config.script || 'npm run deploy';
      const [command, ...args] = deployScript.split(' ');
      
      const task = await this.taskManager.addTask(command, args, repoPath, {
        allowCluster: true
      });

      // Subscribe to live logs if using cluster
      if (task.clusterId && this.clusterManager) {
        const clusterId = task.clusterId;
        
        this.clusterManager.subscribeToTaskUpdates(clusterId, task.id, (event, data) => {
          this.broadcastDeploymentEvent(projectId, 'deployment_log', {
            deploymentId,
            event,
            data,
            timestamp: Date.now()
          });
        });
      }

      // Wait for task completion
      await this.waitForTask(task.id);
      
      const completedTask = this.taskManager.getTask(task.id);
      
      // Cleanup subscription
      if (task.clusterId && this.clusterManager) {
        this.clusterManager.unsubscribeFromTaskUpdates(task.clusterId, task.id);
      }

      if (completedTask.status === 'completed') {
        deployment.status = 'success';
      } else {
        deployment.status = 'failed';
        deployment.error = completedTask.error;
      }
    } catch (error) {
      deployment.status = 'failed';
      deployment.error = error.message;
    }

    deployment.completedAt = Date.now();
    
    // Notify users
    this.broadcastDeploymentEvent(projectId, 'deployment_completed', {
      deploymentId,
      status: deployment.status,
      environment,
      duration: deployment.completedAt - deployment.startedAt
    });

    return deployment;
  }

  async waitForTask(taskId, timeout = 300000) {
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
      const interval = setInterval(() => {
        const task = this.taskManager.getTask(taskId);
        
        if (task.status === 'completed' || task.status === 'failed') {
          clearInterval(interval);
          resolve(task);
        }
        
        if (Date.now() - startTime > timeout) {
          clearInterval(interval);
          reject(new Error('Deployment timeout'));
        }
      }, 500);
    });
  }

  broadcastDeploymentEvent(projectId, event, data) {
    if (this.collaborationService) {
      this.collaborationService.broadcastToProject(projectId, event, data);
    }
  }

  getDeployment(deploymentId) {
    return this.deployments.get(deploymentId);
  }

  getProjectDeployments(projectId) {
    return Array.from(this.deployments.values())
      .filter(d => d.projectId === projectId)
      .sort((a, b) => b.startedAt - a.startedAt);
  }
}

module.exports = {
  CIPipeline,
  CDPipeline
};

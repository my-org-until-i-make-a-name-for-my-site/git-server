# Advanced CI/CD Features

## Overview

Codara provides a comprehensive CI/CD system with advanced features for building, testing, and deploying your applications across distributed clusters.

## Features

### 1. Pipeline Configuration

Create `.codara-ci.yml` in your repository root:

```yaml
# Basic pipeline
stages:
  - build
  - test
  - deploy

variables:
  NODE_VERSION: "18"
  DEPLOY_ENV: "production"

build:
  stage: build
  cluster: high-power  # or low-power
  script:
    - npm ci
    - npm run build
  artifacts:
    paths:
      - dist/
      - build/
    expire_in: 1 week
  cache:
    paths:
      - node_modules/
  only:
    - main
    - develop

test:
  stage: test
  cluster: low-power
  script:
    - npm run test:unit
    - npm run test:integration
  coverage: /Coverage: (\d+\.\d+)%/
  artifacts:
    reports:
      - coverage/
  retry:
    max: 2
    when: script_failure

deploy:
  stage: deploy
  cluster: high-power
  script:
    - npm run deploy
  environment:
    name: production
    url: https://app.example.com
  only:
    - main
  when: manual
```

### 2. Matrix Builds

Run jobs in parallel with different configurations:

```yaml
test:
  stage: test
  matrix:
    - NODE_VERSION: ["16", "18", "20"]
      OS: ["ubuntu", "windows"]
  script:
    - node --version
    - npm test
```

### 3. Caching

Speed up builds with intelligent caching:

```yaml
cache:
  key: "${CI_COMMIT_REF_SLUG}"
  paths:
    - node_modules/
    - .npm/
    - dist/
  policy: pull-push  # pull, push, or pull-push
```

Cache is stored in `Z:/mnt/cache/{project_id}/{cache_key}/`

### 4. Artifacts

Collect and store build outputs:

```yaml
artifacts:
  name: "build-${CI_COMMIT_SHORT_SHA}"
  paths:
    - dist/
    - build/
    - "*.log"
  exclude:
    - "*.tmp"
  expire_in: 30 days
  when: on_success  # on_success, on_failure, or always
```

Artifacts stored in `Z:/mnt/artifacts/{job_id}/`

### 5. Dependencies

Define job dependencies:

```yaml
deploy:
  stage: deploy
  dependencies:
    - build
    - test
  script:
    - ls dist/  # Has access to build artifacts
```

### 6. Conditional Execution

Run jobs based on conditions:

```yaml
deploy-staging:
  script:
    - deploy staging
  only:
    - develop
  except:
    - tags

deploy-production:
  script:
    - deploy production
  only:
    - tags
  when: manual
```

### 7. Docker Support

Build and push Docker images:

```yaml
docker-build:
  stage: build
  image: docker:latest
  services:
    - docker:dind
  script:
    - docker build -t myapp:${CI_COMMIT_SHA} .
    - docker push myapp:${CI_COMMIT_SHA}
```

### 8. Secrets Management

Use encrypted secrets in pipelines:

```yaml
deploy:
  script:
    - echo "$DEPLOY_KEY" | base64 -d > key.pem
    - scp -i key.pem dist/* server:/var/www/
  secrets:
    DEPLOY_KEY:
      vault: production/deploy_key
```

### 9. Notifications

Get notified on job status:

```yaml
notify:
  stage: deploy
  script:
    - echo "Deployment complete"
  after_script:
    - curl -X POST https://hooks.slack.com/... -d "Deployed!"
```

### 10. Parallel Jobs

Run multiple jobs concurrently:

```yaml
test:parallel:
  parallel: 5
  script:
    - npm run test -- --shard=${CI_NODE_INDEX}/${CI_NODE_TOTAL}
```

## Storage Locations

All CI/CD data uses shared Z: drive for cluster access:

```
Z:/mnt/
├── repos/{owner}/{repo}/          # Git repositories
├── runners/
│   └── jobs/{job_id}/             # Active jobs
│       ├── job.json               # Job configuration
│       ├── workspace/             # Working directory
│       ├── logs/                  # Execution logs
│       ├── artifacts/             # Job artifacts
│       └── cache/                 # Job-specific cache
├── cache/{project_id}/            # Shared cache
│   └── {cache_key}/
├── artifacts/{job_id}/            # Archived artifacts
└── secrets/                       # Encrypted secrets (admin only)
```

## Pipeline Variables

### Built-in Variables

Available in all jobs:

```yaml
CI_COMMIT_SHA         # Full commit SHA
CI_COMMIT_SHORT_SHA   # Short commit SHA (8 chars)
CI_COMMIT_REF_NAME    # Branch or tag name
CI_COMMIT_MESSAGE     # Commit message
CI_PROJECT_NAME       # Repository name
CI_PROJECT_OWNER      # Repository owner
CI_JOB_ID             # Unique job ID
CI_JOB_NAME           # Job name from YAML
CI_STAGE              # Current stage
CI_CLUSTER_ID         # Assigned cluster ID
CI_CLUSTER_POWER      # high-power or low-power
CI_NODE_INDEX         # For parallel jobs (0-based)
CI_NODE_TOTAL         # Total parallel jobs
```

### Custom Variables

Define in `.codara-ci.yml`:

```yaml
variables:
  CUSTOM_VAR: "value"
  DEPLOY_URL: "https://example.com"
```

Or set via API:

```bash
POST /api/:owner/:repo/variables
{
  "key": "API_KEY",
  "value": "secret",
  "protected": true,
  "masked": true
}
```

## API Endpoints

### Trigger Pipeline

```bash
POST /api/:owner/:repo/pipelines
{
  "ref": "main",
  "variables": {
    "DEPLOY_ENV": "staging"
  }
}
```

### Get Pipeline Status

```bash
GET /api/:owner/:repo/pipelines/:pipeline_id
```

### Get Job Logs

```bash
GET /api/:owner/:repo/jobs/:job_id/logs
```

### Download Artifacts

```bash
GET /api/:owner/:repo/jobs/:job_id/artifacts
```

### Cancel Pipeline

```bash
POST /api/:owner/:repo/pipelines/:pipeline_id/cancel
```

### Retry Job

```bash
POST /api/:owner/:repo/jobs/:job_id/retry
```

## Cluster Selection

Jobs can specify cluster requirements:

```yaml
build:
  cluster: high-power
  resources:
    cpu: 4
    memory: 8GB
    disk: 20GB
```

Scheduler selects cluster based on:
1. Power level (high/low)
2. Available resources
3. Current load
4. Permission (user/org has high-power access)

## Best Practices

### 1. Use Cache Wisely

```yaml
cache:
  key: 
    files:
      - package-lock.json
  paths:
    - node_modules/
```

### 2. Minimize Artifact Size

```yaml
artifacts:
  paths:
    - dist/
  exclude:
    - "**/*.map"
    - "**/*.log"
```

### 3. Fail Fast

```yaml
test:
  script:
    - npm run lint || exit 1
    - npm test || exit 1
```

### 4. Use Stages

Organize jobs logically:
- Build stage: Compile/build
- Test stage: Run tests
- Deploy stage: Deploy to environments

### 5. Secure Secrets

Never commit secrets:
- Use environment variables
- Store in encrypted vault
- Use masked variables in logs

## Performance Optimizations

### 1. Parallel Execution

```yaml
test:
  parallel: 
    matrix:
      - SHARD: [1, 2, 3, 4, 5]
  script:
    - npm run test:shard:${SHARD}
```

### 2. Smart Caching

```yaml
cache:
  key: "${CI_COMMIT_REF_SLUG}-${CI_COMMIT_SHA}"
  paths:
    - .cache/
  policy: pull-push
  fallback_keys:
    - "${CI_COMMIT_REF_SLUG}-"
    - "main-"
```

### 3. Incremental Builds

```yaml
build:
  script:
    - if [ "$CI_COMMIT_REF_NAME" != "main" ]; then
        npm run build:incremental
      else
        npm run build:full
      fi
```

### 4. Resource Limits

```yaml
build:
  timeout: 30m
  resources:
    memory: 4GB
  interruptible: true  # Can be interrupted for higher priority jobs
```

## Monitoring

### Real-time Logs

Live stream logs via WebSocket:

```javascript
const ws = new WebSocket(`wss://codara.dev/ws/jobs/${jobId}/logs`);
ws.onmessage = (event) => {
  console.log(event.data);
};
```

### Metrics

Track pipeline performance:

- Average duration per stage
- Success/failure rates
- Resource utilization
- Cache hit rates
- Artifact sizes

Access via:
```bash
GET /api/:owner/:repo/metrics
```

## Troubleshooting

### Job Stuck

1. Check cluster availability
2. Review resource requirements
3. Check for infinite loops
4. Verify permissions

### Slow Builds

1. Enable caching
2. Use parallel jobs
3. Optimize dependencies
4. Use incremental builds

### Artifacts Missing

1. Check artifact paths
2. Verify dependencies are set
3. Check expiration settings
4. Review job logs for errors

## Examples

### Node.js Project

```yaml
stages:
  - build
  - test
  - deploy

cache:
  paths:
    - node_modules/

build:
  stage: build
  script:
    - npm ci
    - npm run build
  artifacts:
    paths:
      - dist/

test:
  stage: test
  parallel: 3
  script:
    - npm run test:shard:${CI_NODE_INDEX}
  coverage: /All files\s+\|\s+([\d.]+)/

deploy:
  stage: deploy
  script:
    - npm run deploy
  only:
    - main
  when: manual
```

### Python Project

```yaml
stages:
  - test
  - build
  - deploy

test:
  stage: test
  matrix:
    - PYTHON_VERSION: ["3.9", "3.10", "3.11"]
  script:
    - pip install -r requirements.txt
    - pytest --cov
  artifacts:
    reports:
      - coverage.xml

build:
  stage: build
  script:
    - python setup.py bdist_wheel
  artifacts:
    paths:
      - dist/

deploy:
  stage: deploy
  script:
    - twine upload dist/*
  only:
    - tags
```

### Docker Multi-stage

```yaml
build:
  stage: build
  script:
    - docker build --target builder -t app:builder .
    - docker build --target runtime -t app:${CI_COMMIT_SHA} .
  artifacts:
    paths:
      - Dockerfile

test:
  stage: test
  script:
    - docker run app:${CI_COMMIT_SHA} npm test

deploy:
  stage: deploy
  script:
    - docker push app:${CI_COMMIT_SHA}
    - docker tag app:${CI_COMMIT_SHA} app:latest
    - docker push app:latest
  only:
    - main
```

## Future Features

- [ ] Kubernetes integration
- [ ] Terraform/IaC support
- [ ] Auto-scaling clusters
- [ ] ML model training pipelines
- [ ] Security scanning
- [ ] SAST/DAST integration
- [ ] Container scanning
- [ ] License compliance checks

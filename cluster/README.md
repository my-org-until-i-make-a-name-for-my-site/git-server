# Codara Cluster Agent

This is the cluster agent software that runs on remote machines to enable distributed task execution for CI/CD pipelines.

## Features

- **Auto-discovery**: Automatically announces itself on the local network
- **Task execution**: Executes commands remotely for CI/CD pipelines
- **Resource monitoring**: Reports CPU, memory, and load statistics
- **Load balancing**: Rejects tasks when at capacity
- **Real-time updates**: WebSocket support for live task output
- **Secure**: Requires cluster secret for authentication

## Installation

1. Copy this folder to your cluster node:
```bash
scp -r cluster/ user@cluster-node:/opt/codara-cluster/
```

2. Install dependencies:
```bash
cd /opt/codara-cluster
npm install
```

3. Configure the agent:
```bash
cp .env.example .env
nano .env
```

Important settings:
- `CLUSTER_PORT`: HTTP API port (default: 4000)
- `DISCOVERY_PORT`: UDP discovery port (default: 4001)
- `CLUSTER_SECRET`: Shared secret with main server (must match!)
- `MAX_CONCURRENT_TASKS`: How many tasks can run simultaneously
- `MAX_CPU_PERCENT`: Max CPU usage before rejecting tasks
- `MAX_MEMORY_PERCENT`: Max memory usage before rejecting tasks

4. Start the agent:
```bash
npm start
```

## Running as a Service

### Linux (systemd)

Create a service file `/etc/systemd/system/codara-cluster.service`:

```ini
[Unit]
Description=Codara Cluster Agent
After=network.target

[Service]
Type=simple
User=codara
WorkingDirectory=/opt/codara-cluster
ExecStart=/usr/bin/node /opt/codara-cluster/agent.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable codara-cluster
sudo systemctl start codara-cluster
sudo systemctl status codara-cluster
```

### Windows

Use `node-windows` or NSSM to run as a Windows service.

### macOS

Create a LaunchDaemon plist file.

## API Endpoints

### Health Check
```
GET /health
```

### System Stats
```
GET /stats
```
Returns CPU, memory, and task capacity information.

### Execute Task
```
POST /execute
Headers: X-Cluster-Secret: your-secret
Body: {
  "command": "npm",
  "args": ["test"],
  "cwd": "/path/to/project",
  "env": { "NODE_ENV": "test" }
}
```

### Get Task Status
```
GET /task/:id
Headers: X-Cluster-Secret: your-secret
```

### Get All Tasks
```
GET /tasks
Headers: X-Cluster-Secret: your-secret
```

### Cancel Task
```
POST /task/:id/cancel
Headers: X-Cluster-Secret: your-secret
```

## WebSocket Updates

Connect to `ws://cluster-node:4000` to receive real-time task updates:

```javascript
const ws = new WebSocket('ws://cluster-node:4000');
ws.on('message', (data) => {
  const update = JSON.parse(data);
  console.log('Task update:', update);
});
```

## Discovery Protocol

The agent broadcasts UDP packets on port 4001:

**Announcement** (every 5 seconds):
```json
{
  "type": "cluster_announce",
  "hostname": "cluster-01",
  "platform": "linux",
  "arch": "x64",
  "cpus": 8,
  "totalMemory": 16000000000,
  "port": 4000,
  "timestamp": 1234567890
}
```

**Stats** (every 10 seconds):
```json
{
  "type": "cluster_stats",
  "hostname": "cluster-01",
  "port": 4000,
  "stats": {
    "cpu": 0.5,
    "memoryUsagePercent": 45.2,
    "runningTasks": 2,
    "availableSlots": 2
  },
  "timestamp": 1234567890
}
```

## Security

- Always use a strong `CLUSTER_SECRET`
- Run the agent as a non-root user
- Use firewall rules to restrict access to CLUSTER_PORT
- Consider using a VPN for cluster communication
- Monitor logs for unauthorized access attempts

## Troubleshooting

### Agent not discovered
- Check firewall allows UDP on DISCOVERY_PORT
- Verify network allows broadcast/multicast
- Check both main server and agent are on same network

### Tasks failing
- Check task logs in `/tasks` endpoint
- Verify command exists on cluster node
- Check file permissions and paths
- Review resource limits (CPU/memory)

### High resource usage
- Reduce `MAX_CONCURRENT_TASKS`
- Check for runaway processes
- Monitor with `GET /stats`

## Logs

The agent logs to stdout. Redirect to a file or use systemd journal:

```bash
# View logs with systemd
sudo journalctl -u codara-cluster -f

# Or redirect when running manually
node agent.js >> /var/log/codara-cluster.log 2>&1
```

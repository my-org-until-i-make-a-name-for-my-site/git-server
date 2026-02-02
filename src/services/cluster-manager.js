const WebSocket = require('ws');
const http = require('http');

class ClusterClient {
    constructor(clusterInfo) {
        this.info = clusterInfo;
        this.ws = null;
        this.connected = false;
        this.reconnectTimer = null;
        this.eventHandlers = new Map();
    }

    connect() {
        const wsUrl = `ws://${this.info.address}:${this.info.port}`;

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.on('open', () => {
                console.log(`Connected to cluster ${this.info.hostname}`);
                this.connected = true;
                this.emit('connected', this.info);
            });

            this.ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.handleMessage(message);
                } catch (e) {
                    console.error('Invalid message from cluster:', e);
                }
            });

            this.ws.on('close', () => {
                console.log(`Disconnected from cluster ${this.info.hostname}`);
                this.connected = false;
                this.emit('disconnected', this.info);
                this.scheduleReconnect();
            });

            this.ws.on('error', (err) => {
                console.error(`Cluster ${this.info.hostname} error:`, err.message);
                this.emit('error', { cluster: this.info, error: err });
            });
        } catch (error) {
            console.error(`Failed to connect to cluster ${this.info.hostname}:`, error);
            this.scheduleReconnect();
        }
    }

    scheduleReconnect() {
        if (this.reconnectTimer) return;

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, 5000);
    }

    handleMessage(message) {
        switch (message.type) {
            case 'task_update':
                this.emit('task_update', message);
                break;
            default:
                this.emit('message', message);
        }
    }

    async executeTask(command, args = [], cwd = null, env = {}) {
        const url = `http://${this.info.address}:${this.info.port}/execute`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ command, args, cwd, env })
        });

        if (!response.ok) {
            throw new Error(`Cluster execution failed: ${response.statusText}`);
        }

        return await response.json();
    }

    async getTaskStatus(taskId) {
        const url = `http://${this.info.address}:${this.info.port}/task/${taskId}`;

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Failed to get task status: ${response.statusText}`);
        }

        return await response.json();
    }

    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(handler);
    }

    emit(event, data) {
        const handlers = this.eventHandlers.get(event);
        if (handlers) {
            handlers.forEach(handler => handler(data));
        }
    }

    disconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        this.connected = false;
    }
}

class ClusterManager {
    constructor(clusterDiscovery) {
        this.discovery = clusterDiscovery;
        this.clients = new Map();
        this.taskCallbacks = new Map();

        if (this.discovery) {
            this.setupDiscoveryHandlers();
        }
    }

    setupDiscoveryHandlers() {
        this.discovery.on('cluster_discovered', (cluster) => {
            this.connectToCluster(cluster);
        });

        this.discovery.on('cluster_lost', (cluster) => {
            this.disconnectFromCluster(cluster.id);
        });
    }

    connectToCluster(cluster) {
        if (this.clients.has(cluster.id)) {
            return this.clients.get(cluster.id);
        }

        const client = new ClusterClient(cluster);

        client.on('task_update', (message) => {
            this.handleTaskUpdate(cluster.id, message);
        });

        client.connect();
        this.clients.set(cluster.id, client);

        return client;
    }

    disconnectFromCluster(clusterId) {
        const client = this.clients.get(clusterId);
        if (client) {
            client.disconnect();
            this.clients.delete(clusterId);
        }
    }

    handleTaskUpdate(clusterId, message) {
        const { taskId, event, data } = message;
        const key = `${clusterId}:${taskId}`;

        const callbacks = this.taskCallbacks.get(key);
        if (callbacks) {
            callbacks.forEach(cb => cb(event, data));
        }
    }

    async executeOnCluster(clusterId, command, args = [], cwd = null, env = {}) {
        let client = this.clients.get(clusterId);

        if (!client || !client.connected) {
            // Try to get cluster info from discovery
            const clusters = this.discovery.getClusters();
            const cluster = clusters.find(c => c.id === clusterId || `${c.hostname}:${c.port}` === clusterId);

            if (!cluster) {
                throw new Error('Cluster not found or not connected');
            }

            client = this.connectToCluster(cluster);
        }

        return await client.executeTask(command, args, cwd, env);
    }

    subscribeToTaskUpdates(clusterId, taskId, callback) {
        const key = `${clusterId}:${taskId}`;

        if (!this.taskCallbacks.has(key)) {
            this.taskCallbacks.set(key, []);
        }

        this.taskCallbacks.get(key).push(callback);
    }

    unsubscribeFromTaskUpdates(clusterId, taskId, callback) {
        const key = `${clusterId}:${taskId}`;
        const callbacks = this.taskCallbacks.get(key);

        if (callbacks) {
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }

            if (callbacks.length === 0) {
                this.taskCallbacks.delete(key);
            }
        }
    }

    getCluster(clusterId) {
        return this.clients.get(clusterId);
    }

    getAllClusters() {
        return Array.from(this.clients.values());
    }
}

module.exports = ClusterManager;

const dgram = require('dgram');
const os = require('os');
const EventEmitter = require('events');
const http = require('http');

class ClusterDiscovery extends EventEmitter {
    constructor(port = 8000) {
        super();
        this.port = port;
        this.clusters = new Map();
        this.socket = null;
        this.broadcastInterval = null;
        this.cleanupInterval = null;
        this.scanInterval = null;
        this.localInfo = this.getLocalInfo();
        this.networkRanges = this.getNetworkRanges();
    }

    getLocalInfo() {
        const interfaces = os.networkInterfaces();
        const addresses = [];

        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    addresses.push(iface.address);
                }
            }
        }

        return {
            hostname: os.hostname(),
            platform: os.platform(),
            arch: os.arch(),
            cpus: os.cpus().length,
            totalMemory: os.totalmem(),
            addresses: addresses,
            port: process.env.CLUSTER_PORT || 4000
        };
    }

    getNetworkRanges() {
        const interfaces = os.networkInterfaces();
        const ranges = [];

        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    const ip = iface.address;
                    const netmask = iface.netmask;

                    // Calculate network range
                    const ipParts = ip.split('.').map(Number);
                    const maskParts = netmask.split('.').map(Number);

                    const networkParts = ipParts.map((part, i) => part & maskParts[i]);
                    const broadcastParts = ipParts.map((part, i) => part | (~maskParts[i] & 255));

                    ranges.push({
                        interface: name,
                        network: networkParts.join('.'),
                        broadcast: broadcastParts.join('.'),
                        start: networkParts,
                        end: broadcastParts,
                        netmask: netmask
                    });
                }
            }
        }

        return ranges;
    }

    getSystemStats() {
        const loadavg = os.loadavg();
        const freemem = os.freemem();
        const totalmem = os.totalmem();
        const totalMemoryGB = totalmem / (1024 * 1024 * 1024);
        const isHighPower = totalMemoryGB >= 16;

        return {
            cpu: loadavg[0], // 1-minute load average
            memoryUsed: totalmem - freemem,
            memoryFree: freemem,
            memoryTotal: totalmem,
            memoryTotalGB: totalMemoryGB,
            memoryUsagePercent: ((totalmem - freemem) / totalmem) * 100,
            uptime: os.uptime(),
            powerLevel: isHighPower ? 'high' : 'low',
            isHighPower: isHighPower
        };
    }

    start() {
        this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

        this.socket.on('error', (err) => {
            if (err && (err.code === 'EADDRINUSE' || err.code === 'EACCES')) {
                console.warn(`Cluster discovery error on port ${this.port}: ${err.code} (${err.message})`);
                this.stop();
                
                // Try fallback port
                if (this.port !== 4005) {
                    console.log(`Attempting cluster discovery on fallback port 4005...`);
                    this.port = 4005;
                    setTimeout(() => this.start(), 500);
                } else {
                    console.error('Failed to bind cluster discovery socket on all attempted ports');
                }
                return;
            }
            console.error('Cluster discovery error:', err);
        });

        this.socket.on('message', (msg, rinfo) => {
            try {
                const data = JSON.parse(msg.toString());

                if (data.type === 'cluster_announce') {
                    // Don't add ourselves
                    if (data.hostname === this.localInfo.hostname) {
                        return;
                    }

                    const clusterId = `${data.hostname}:${data.port}`;

                    this.clusters.set(clusterId, {
                        ...data,
                        address: rinfo.address,
                        lastSeen: Date.now(),
                        discovered_via: 'udp_broadcast'
                    });

                    this.emit('cluster_discovered', {
                        id: clusterId,
                        ...data,
                        address: rinfo.address
                    });
                } else if (data.type === 'cluster_stats') {
                    const clusterId = `${data.hostname}:${data.port}`;
                    const cluster = this.clusters.get(clusterId);

                    if (cluster) {
                        cluster.stats = data.stats;
                        cluster.lastSeen = Date.now();
                    }
                }
            } catch (e) {
                // Ignore invalid messages
            }
        });

        this.socket.on('listening', () => {
            const address = this.socket.address();
            console.log(`Cluster discovery listening on ${address.address}:${address.port}`);
            this.socket.setBroadcast(true);
        });

        this.socket.bind(this.port);

        // Broadcast our presence every 5 seconds
        this.broadcastInterval = setInterval(() => {
            this.announce();
        }, 5000);

        // Broadcast stats every 10 seconds
        setInterval(() => {
            this.broadcastStats();
        }, 10000);

        // Scan network for clusters every 30 seconds
        this.scanInterval = setInterval(() => {
            this.scanNetwork();
        }, 30000);

        // Clean up stale clusters every 30 seconds
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 30000);

        // Initial announcement and scan
        setTimeout(() => {
            this.announce();
            this.scanNetwork();
        }, 100);
    }

    announce() {
        const message = JSON.stringify({
            type: 'cluster_announce',
            ...this.localInfo,
            timestamp: Date.now()
        });

        this.broadcast(message);
    }

    broadcastStats() {
        const message = JSON.stringify({
            type: 'cluster_stats',
            hostname: this.localInfo.hostname,
            port: this.localInfo.port,
            stats: this.getSystemStats(),
            timestamp: Date.now()
        });

        this.broadcast(message);
    }

    broadcast(message) {
        if (!this.socket) return;

        const broadcastAddresses = new Set([
            '255.255.255.255',
            '224.0.0.1',
            '0.0.0.0',
            'localhost',
            '192.168.1.186'
        ]);

        // Add interface-specific broadcast addresses
        for (const range of this.networkRanges) {
            if (range.broadcast) {
                broadcastAddresses.add(range.broadcast);
            }
        }

        broadcastAddresses.forEach(addr => {
            this.socket.send(message, 0, message.length, this.port, addr, (err) => {
                if (err && err.code !== 'EACCES') {
                    // Ignore EACCES errors (permission denied for broadcast)
                }
            });
        });
    }

    async scanNetwork() {
        const clusterPort = process.env.CLUSTER_PORT || 4000;

        console.log('Scanning network for clusters...');

        for (const range of this.networkRanges) {
            // Scan the network range
            await this.scanRange(range, clusterPort);
        }
    }

    async scanRange(range, clusterPort) {
        const promises = [];

        // Generate all IPs in range
        const start = range.start[3];
        const end = range.end[3];

        for (let i = start + 1; i < end; i++) {
            const ip = `${range.start[0]}.${range.start[1]}.${range.start[2]}.${i}`;

            // Skip our own IPs
            if (this.localInfo.addresses.includes(ip)) {
                continue;
            }

            // Probe this IP for cluster service
            promises.push(this.probeCluster(ip, clusterPort));

            // Batch requests to avoid overwhelming the network
            if (promises.length >= 10) {
                await Promise.allSettled(promises.splice(0, 10));
            }
        }

        // Wait for remaining probes
        if (promises.length > 0) {
            await Promise.allSettled(promises);
        }
    }

    async probeCluster(ip, port) {
        return new Promise((resolve) => {
            const timeout = 2000; // 2 second timeout

            const options = {
                hostname: ip,
                port: port,
                path: '/health',
                method: 'GET',
                timeout: timeout
            };

            const req = http.request(options, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        const clusterInfo = JSON.parse(data);

                        if (clusterInfo.hostname) {
                            const clusterId = `${clusterInfo.hostname}:${port}`;

                            // Get full cluster info
                            this.getClusterStats(ip, port).then(stats => {
                                this.clusters.set(clusterId, {
                                    hostname: clusterInfo.hostname,
                                    address: ip,
                                    port: port,
                                    platform: stats.platform || 'unknown',
                                    arch: stats.arch || 'unknown',
                                    cpus: stats.cpus || 0,
                                    totalMemory: stats.totalMemory || 0,
                                    stats: stats.stats,
                                    lastSeen: Date.now(),
                                    discovered_via: 'network_scan'
                                });

                                this.emit('cluster_discovered', {
                                    id: clusterId,
                                    hostname: clusterInfo.hostname,
                                    address: ip,
                                    port: port
                                });
                            });
                        }
                    } catch (e) {
                        // Not a valid cluster response
                    }
                    resolve();
                });
            });

            req.on('error', () => {
                // Host not reachable or not a cluster
                resolve();
            });

            req.on('timeout', () => {
                req.destroy();
                resolve();
            });

            req.end();
        });
    }

    async getClusterStats(ip, port) {
        return new Promise((resolve) => {
            const options = {
                hostname: ip,
                port: port,
                path: '/stats',
                method: 'GET',
                timeout: 2000
            };

            const req = http.request(options, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        const stats = JSON.parse(data);
                        resolve(stats);
                    } catch (e) {
                        resolve({});
                    }
                });
            });

            req.on('error', () => {
                resolve({});
            });

            req.on('timeout', () => {
                req.destroy();
                resolve({});
            });

            req.end();
        });
    }

    cleanup() {
        const now = Date.now();
        const timeout = 60000; // 60 seconds

        for (const [clusterId, cluster] of this.clusters.entries()) {
            if (now - cluster.lastSeen > timeout) {
                this.clusters.delete(clusterId);
                this.emit('cluster_lost', { id: clusterId, ...cluster });
                console.log(`Cluster lost: ${clusterId}`);
            }
        }
    }

    getClusters() {
        return Array.from(this.clusters.values());
    }

    getCluster(clusterId) {
        return this.clusters.get(clusterId);
    }

    getHighPowerClusters() {
        return this.getClusters().filter(c => c.stats && c.stats.isHighPower);
    }

    getLowPowerClusters() {
        return this.getClusters().filter(c => c.stats && !c.stats.isHighPower);
    }

    getBestCluster(requireHighPower = false) {
        let clusters = this.getClusters();

        // Filter by power level if required
        if (requireHighPower) {
            clusters = clusters.filter(c => c.stats && c.stats.isHighPower);
        }

        if (clusters.length === 0) {
            return null;
        }

        // Sort by available resources
        clusters.sort((a, b) => {
            const aScore = this.calculateScore(a);
            const bScore = this.calculateScore(b);
            return bScore - aScore; // Higher score is better
        });

        return clusters[0];
    }

    calculateScore(cluster) {
        if (!cluster.stats) {
            return 0;
        }

        // Lower CPU load and memory usage = higher score
        const cpuScore = Math.max(0, 100 - (cluster.stats.cpu * 10));
        const memScore = Math.max(0, 100 - cluster.stats.memoryUsagePercent);

        // Factor in available task slots if present
        let slotScore = 50;
        if (cluster.stats.availableSlots !== undefined && cluster.stats.maxTasks) {
            slotScore = (cluster.stats.availableSlots / cluster.stats.maxTasks) * 100;
        }

        return (cpuScore + memScore + slotScore) / 3;
    }

    stop() {
        if (this.broadcastInterval) {
            clearInterval(this.broadcastInterval);
        }
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
        }
        if (this.socket) {
            this.socket.close();
        }
        this.clusters.clear();
    }
}

module.exports = ClusterDiscovery;

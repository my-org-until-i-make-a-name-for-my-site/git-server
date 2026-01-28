#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

console.log('Codara Cluster Agent - Service Installer');
console.log('=========================================\n');

const platform = os.platform();
const agentPath = __dirname;
const serviceName = 'codara-cluster';

if (platform === 'linux') {
  installLinuxService();
} else if (platform === 'win32') {
  console.log('Windows service installation:');
  console.log('Please use NSSM or node-windows to install as a service.');
  console.log('See README.md for details.');
} else if (platform === 'darwin') {
  console.log('macOS service installation:');
  console.log('Please create a LaunchDaemon plist file.');
  console.log('See README.md for details.');
} else {
  console.log(`Platform ${platform} not supported for automatic installation.`);
  console.log('Please install manually. See README.md for details.');
}

function installLinuxService() {
  console.log('Installing systemd service...\n');

  // Check if running as root
  if (process.getuid && process.getuid() !== 0) {
    console.error('ERROR: Must run as root (use sudo)');
    process.exit(1);
  }

  // Get node path
  const nodePath = execSync('which node').toString().trim();
  
  // Create service file
  const serviceContent = `[Unit]
Description=Codara Cluster Agent
After=network.target

[Service]
Type=simple
User=nobody
WorkingDirectory=${agentPath}
ExecStart=${nodePath} ${path.join(agentPath, 'agent.js')}
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
`;

  const serviceFilePath = `/etc/systemd/system/${serviceName}.service`;
  
  try {
    fs.writeFileSync(serviceFilePath, serviceContent);
    console.log(`✓ Service file created: ${serviceFilePath}`);

    // Reload systemd
    execSync('systemctl daemon-reload');
    console.log('✓ Systemd reloaded');

    // Enable service
    execSync(`systemctl enable ${serviceName}`);
    console.log(`✓ Service enabled`);

    console.log('\nService installed successfully!');
    console.log('\nNext steps:');
    console.log(`1. Configure the agent: nano ${path.join(agentPath, '.env')}`);
    console.log(`2. Start the service: sudo systemctl start ${serviceName}`);
    console.log(`3. Check status: sudo systemctl status ${serviceName}`);
    console.log(`4. View logs: sudo journalctl -u ${serviceName} -f`);
  } catch (error) {
    console.error('ERROR installing service:', error.message);
    process.exit(1);
  }
}

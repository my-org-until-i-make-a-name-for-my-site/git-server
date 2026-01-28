const fs = require('fs-extra');
const path = require('path');

class ConfigManager {
  constructor(configPath) {
    this.configPath = configPath || process.env.CONFIG_PATH || 'Z:/mnt/app.ini';
    this.fallbackPath = './config/app.ini';
    this.config = {};
    this.load();
  }

  load() {
    let actualPath = this.configPath;
    
    // Try primary path first
    if (!fs.existsSync(this.configPath)) {
      console.log(`Config file not found at ${this.configPath}, trying fallback...`);
      actualPath = this.fallbackPath;
      
      // Ensure fallback directory exists
      fs.ensureDirSync(path.dirname(this.fallbackPath));
      
      // Create default config if fallback doesn't exist
      if (!fs.existsSync(this.fallbackPath)) {
        this.createDefaultConfig(this.fallbackPath);
      }
    }

    try {
      const content = fs.readFileSync(actualPath, 'utf8');
      this.config = this.parseINI(content);
      console.log(`Configuration loaded from: ${actualPath}`);
    } catch (error) {
      console.error('Error loading configuration:', error);
      this.config = this.getDefaultConfig();
    }
  }

  parseINI(content) {
    const config = {};
    let currentSection = 'general';
    config[currentSection] = {};

    const lines = content.split('\n');
    for (let line of lines) {
      line = line.trim();
      
      // Skip comments and empty lines
      if (!line || line.startsWith(';') || line.startsWith('#')) {
        continue;
      }

      // Section header
      if (line.startsWith('[') && line.endsWith(']')) {
        currentSection = line.slice(1, -1).trim();
        config[currentSection] = {};
        continue;
      }

      // Key-value pair
      const equalIndex = line.indexOf('=');
      if (equalIndex > -1) {
        const key = line.slice(0, equalIndex).trim();
        let value = line.slice(equalIndex + 1).trim();
        
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        
        // Convert boolean strings
        if (value.toLowerCase() === 'true') value = true;
        else if (value.toLowerCase() === 'false') value = false;
        // Convert numeric strings
        else if (!isNaN(value) && value !== '') value = Number(value);
        
        config[currentSection][key] = value;
      }
    }

    return config;
  }

  getDefaultConfig() {
    return {
      general: {
        app_name: 'Codara',
        version: '1.0.0',
        environment: 'production'
      },
      server: {
        port: 3000,
        host: '0.0.0.0'
      },
      admin: {
        initial_admin_email: 'admin@localhost',
        initial_admin_password: 'admin123',
        allow_user_registration: true,
        require_email_verification: false
      },
      security: {
        jwt_secret: 'your-super-secret-jwt-key-change-this-in-production',
        password_hash_type: 'bcrypt',
        session_timeout: 604800
      },
      storage: {
        repos_base_path: './repos',
        jobs_base_path: './mnt/runners/jobs',
        artifacts_path: './mnt/artifacts',
        shared_storage_path: './mnt'
      },
      clusters: {
        enable_discovery: true,
        discovery_port: 4001,
        cluster_port: 4000,
        cluster_secret: 'your-cluster-secret-key'
      },
      features: {
        enable_organizations: true,
        enable_ci_cd: true,
        enable_collaboration: true,
        enable_vscode_editor: true
      },
      limits: {
        max_repo_size_mb: 1024,
        max_artifact_size_mb: 512,
        max_concurrent_jobs: 10
      }
    };
  }

  createDefaultConfig(filepath) {
    const defaultConfig = this.getDefaultConfig();
    const iniContent = this.toINI(defaultConfig);
    fs.writeFileSync(filepath, iniContent);
    console.log(`Created default configuration at: ${filepath}`);
  }

  toINI(config) {
    let ini = '';
    
    for (const [section, values] of Object.entries(config)) {
      ini += `[${section}]\n`;
      for (const [key, value] of Object.entries(values)) {
        let v = value;
        if (typeof value === 'string' && value.includes(' ')) {
          v = `"${value}"`;
        }
        ini += `${key} = ${v}\n`;
      }
      ini += '\n';
    }
    
    return ini;
  }

  get(section, key, defaultValue = null) {
    if (this.config[section] && this.config[section][key] !== undefined) {
      return this.config[section][key];
    }
    return defaultValue;
  }

  getSection(section) {
    return this.config[section] || {};
  }

  getAllConfig() {
    return this.config;
  }

  reload() {
    this.load();
  }
}

// Singleton instance
let configInstance = null;

function getConfig() {
  if (!configInstance) {
    configInstance = new ConfigManager();
  }
  return configInstance;
}

module.exports = { ConfigManager, getConfig };

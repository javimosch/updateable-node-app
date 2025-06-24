const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(os.homedir(), '.upncli');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

class ConfigManager {
  constructor() {
    this.config = {
      projects: {}
    };
  }

  async ensureConfigDir() {
    try {
      await fs.mkdir(CONFIG_DIR, { recursive: true });
    } catch (err) {
      // Directory might already exist
    }
  }

  async load() {
    try {
      await this.ensureConfigDir();
      const data = await fs.readFile(CONFIG_FILE, 'utf8');
      this.config = JSON.parse(data);
    } catch (err) {
      // Config file doesn't exist or is invalid, use defaults
      this.config = { projects: {} };
    }
  }

  async save() {
    await this.ensureConfigDir();
    await fs.writeFile(CONFIG_FILE, JSON.stringify(this.config, null, 2));
  }

  getProject(projectName) {
    return this.config.projects[projectName] || null;
  }

  setProject(projectName, projectConfig) {
    this.config.projects[projectName] = {
      ...this.config.projects[projectName],
      ...projectConfig
    };
  }

  deleteProject(projectName) {
    delete this.config.projects[projectName];
  }

  listProjects() {
    return Object.keys(this.config.projects);
  }

  getProjectConfig(projectName) {
    return this.config.projects[projectName] || {
      serverUrl: 'http://localhost:3888',
      bearerToken: null,
      blacklist: ['node_modules', '.git', '.DS_Store', '*.log']
    };
  }

  updateProjectConfig(projectName, updates) {
    const current = this.getProjectConfig(projectName);
    this.setProject(projectName, { ...current, ...updates });
  }
}

module.exports = new ConfigManager();
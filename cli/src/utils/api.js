const axios = require('axios');
const fs = require('fs');
const WebSocket = require('ws');

class APIClient {
  constructor(baseURL, bearerToken = null) {
    this.baseURL = baseURL;
    this.bearerToken = bearerToken;
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000, // 30 seconds
    });

    // Add request interceptor for bearer token
    this.client.interceptors.request.use((config) => {
      if (this.bearerToken) {
        config.headers.Authorization = `Bearer ${this.bearerToken}`;
      }
      return config;
    });
  }

  setBearerToken(token) {
    this.bearerToken = token;
  }

  async uploadFile(filePath, onProgress = null) {
    const FormData = require('form-data');
    const form = new FormData();
    const fileStream = fs.createReadStream(filePath);
    const fileStats = fs.statSync(filePath);
    
    form.append('file', fileStream);

    const config = {
      headers: {
        ...form.getHeaders(),
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    };

    // Add bearer token to headers if available
    if (this.bearerToken) {
      config.headers.Authorization = `Bearer ${this.bearerToken}`;
    }

    // Add progress tracking if callback provided
    if (onProgress) {
      config.onUploadProgress = (progressEvent) => {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / fileStats.size);
        onProgress(percentCompleted, progressEvent.loaded, fileStats.size);
      };
    }

    try {
      const response = await this.client.post('/upload', form, config);
      return response.data;
    } catch (error) {
      if (error.response) {
        throw new Error(`Upload failed: ${error.response.data.error || error.response.statusText}`);
      } else if (error.request) {
        throw new Error('Upload failed: No response from server');
      } else {
        throw new Error(`Upload failed: ${error.message}`);
      }
    }
  }

  async getStatus() {
    try {
      const response = await this.client.get('/status');
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get status: ${error.message}`);
    }
  }

  async startApp() {
    try {
      const response = await this.client.post('/start');
      return response.data;
    } catch (error) {
      if (error.response && error.response.status === 400) {
        throw new Error('App is already running');
      }
      throw new Error(`Failed to start app: ${error.message}`);
    }
  }

  async stopApp() {
    try {
      const response = await this.client.post('/stop');
      return response.data;
    } catch (error) {
      if (error.response && error.response.status === 400) {
        throw new Error('App is not running');
      }
      throw new Error(`Failed to stop app: ${error.message}`);
    }
  }

  async getDeployments() {
    try {
      const response = await this.client.get('/api/deployments');
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get deployments: ${error.message}`);
    }
  }

  async getCurrentDeployment() {
    try {
      const response = await this.client.get('/api/deployment/current');
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get current deployment: ${error.message}`);
    }
  }

  async rollbackToDeployment(version) {
    try {
      const response = await this.client.post(`/api/deployments/rollback/${version}`);
      return response.data;
    } catch (error) {
      if (error.response && error.response.status === 404) {
        throw new Error('Deployment version not found');
      }
      throw new Error(`Failed to rollback: ${error.message}`);
    }
  }

  async getEnvConfigs() {
    try {
      const response = await this.client.get('/api/envs');
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get environment configs: ${error.message}`);
    }
  }

  async getEnvConfig(name) {
    try {
      const response = await this.client.get(`/api/envs/${name}`);
      return response.data;
    } catch (error) {
      if (error.response && error.response.status === 404) {
        throw new Error('Environment config not found');
      }
      throw new Error(`Failed to get environment config: ${error.message}`);
    }
  }

  async saveEnvConfig(name, content) {
    try {
      const response = await this.client.post('/api/envs', { name, content });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to save environment config: ${error.message}`);
    }
  }

  async deleteEnvConfig(name) {
    try {
      const response = await this.client.delete(`/api/envs/${name}`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to delete environment config: ${error.message}`);
    }
  }


  // WebSocket connection for log streaming
  connectToLogs(onMessage, onError = null, onClose = null) {
    const wsUrl = this.baseURL.replace(/^http/, 'ws');
    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
      console.log('Connected to log stream');
    });

    ws.on('message', (data) => {
      onMessage(data.toString());
    });

    ws.on('error', (error) => {
      if (onError) {
        onError(error);
      } else {
        console.error('WebSocket error:', error);
      }
    });

    ws.on('close', () => {
      if (onClose) {
        onClose();
      } else {
        console.log('Log stream disconnected');
      }
    });

    return ws;
  }

  // Test connection to server
  async testConnection() {
    try {
      await this.getStatus();
      return true;
    } catch (error) {
      return false;
    }
  }
}

module.exports = APIClient;
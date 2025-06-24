const inquirer = require('inquirer');
const path = require('path');
const chalk = require('chalk');
const config = require('../utils/config');
const ui = require('../utils/ui');
const APIClient = require('../utils/api');

async function projectCommand(action, projectName = null, options = {}) {
  try {
    // Load existing config
    await config.load();

    switch (action) {
      case 'list':
        await listProjects();
        break;
      case 'setup':
        await setupProject(projectName);
        break;
      case 'status':
        await showProjectStatus(projectName);
        break;
      case 'remove':
        await removeProject(projectName);
        break;
      default:
        await interactiveProjectMenu();
        break;
    }

  } catch (error) {
    ui.logError(`Project command failed: ${error.message}`);
    process.exit(1);
  }
}

async function listProjects() {
  ui.showHeader('📁 UPN CLI Projects');

  const projects = config.listProjects();
  
  if (projects.length === 0) {
    ui.logInfo('No projects configured yet');
    ui.logInfo('Use \'upncli setup <folder>\' to configure a project');
    return;
  }

  console.log(chalk.bold.underline('Configured Projects:'));
  
  for (const projectName of projects) {
    const projectConfig = config.getProjectConfig(projectName);
    
    // Check if project is active (try to connect)
    let isActive = false;
    if (projectConfig.serverUrl) {
      try {
        const api = new APIClient(projectConfig.serverUrl, projectConfig.bearerToken);
        const status = await api.getStatus();
        isActive = status.running;
      } catch (error) {
        // Project is not active/reachable
      }
    }
    
    ui.showProjectStatus(projectName, projectConfig, isActive);
  }
}

async function setupProject(projectName) {
  if (!projectName) {
    const { name } = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Enter project name:',
        validate: (input) => input.trim().length > 0 || 'Project name cannot be empty'
      }
    ]);
    projectName = name.trim();
  }

  ui.showHeader(`⚙️ Setup Project - ${projectName}`);

  const currentConfig = config.getProjectConfig(projectName);

  const { serverUrl } = await inquirer.prompt([
    {
      type: 'input',
      name: 'serverUrl',
      message: 'Enter server URL:',
      default: currentConfig.serverUrl || 'http://localhost:3888',
      validate: (input) => {
        try {
          new URL(input);
          return true;
        } catch {
          return 'Please enter a valid URL';
        }
      }
    }
  ]);

  const { needsAuth } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'needsAuth',
      message: 'Does this server require a bearer token?',
      default: !!currentConfig.bearerToken
    }
  ]);

  let bearerToken = currentConfig.bearerToken;
  if (needsAuth) {
    const { token } = await inquirer.prompt([
      {
        type: 'password',
        name: 'token',
        message: 'Enter bearer token:',
        mask: '*',
        default: currentConfig.bearerToken || '',
        validate: (input) => input.trim().length > 0 || 'Token cannot be empty'
      }
    ]);
    bearerToken = token.trim();
  } else {
    bearerToken = null;
  }

  // Update configuration
  config.updateProjectConfig(projectName, {
    serverUrl: serverUrl.replace(/\/$/, ''), // Remove trailing slash
    bearerToken
  });

  await config.save();

  // Test connection
  ui.logLoading('Testing connection...');
  const api = new APIClient(serverUrl, bearerToken);
  
  try {
    const isConnected = await api.testConnection();
    if (isConnected) {
      ui.logSuccess('Successfully connected to server!');
      
      // Get server status
      const status = await api.getStatus();
      ui.logInfo(`Server status: ${status.running ? 'Running' : 'Stopped'}`);
    } else {
      ui.logWarning('Could not connect to server. Configuration saved anyway.');
    }
  } catch (error) {
    ui.logWarning(`Connection test failed: ${error.message}`);
  }

  ui.logSuccess(`Project '${projectName}' configured successfully`);
}

async function showProjectStatus(projectName) {
  if (!projectName) {
    const projects = config.listProjects();
    if (projects.length === 0) {
      ui.logError('No projects configured');
      return;
    }

    const { selectedProject } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedProject',
        message: 'Select project to check status:',
        choices: projects
      }
    ]);
    projectName = selectedProject;
  }

  const projectConfig = config.getProjectConfig(projectName);
  if (!projectConfig.serverUrl) {
    ui.logError(`Project '${projectName}' is not configured`);
    return;
  }

  ui.showHeader(`📊 Project Status - ${projectName}`);

  const api = new APIClient(projectConfig.serverUrl, projectConfig.bearerToken);

  try {
    ui.logLoading('Checking server status...');
    const status = await api.getStatus();
    
    ui.logSuccess('Connected to server');
    console.log(`  Server URL: ${projectConfig.serverUrl}`);
    console.log(`  Application: ${status.running ? chalk.green('Running') : chalk.red('Stopped')}`);
    console.log(`  Command: ${status.command || 'Not set'}`);
    console.log(`  Base Path: ${status.basePath || 'Not set'}`);
    console.log(`  Last Upload: ${status.lastUploadDate || 'Never'}`);
    console.log(`  Selected Environment: ${status.selectedEnv || 'None'}`);

    // Get deployments info
    try {
      const deployments = await api.getDeployments();
      const current = await api.getCurrentDeployment();
      
      console.log(`  Available Deployments: ${deployments.length}`);
      console.log(`  Current Deployment: ${current.current || 'None'}`);
    } catch (deployError) {
      console.log(`  Deployments: Unable to fetch (${deployError.message})`);
    }

  } catch (error) {
    ui.logError(`Cannot connect to server: ${error.message}`);
  }
}

async function removeProject(projectName) {
  if (!projectName) {
    const projects = config.listProjects();
    if (projects.length === 0) {
      ui.logError('No projects configured');
      return;
    }

    const { selectedProject } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedProject',
        message: 'Select project to remove:',
        choices: projects
      }
    ]);
    projectName = selectedProject;
  }

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: `Are you sure you want to remove project '${projectName}'?`,
      default: false
    }
  ]);

  if (confirm) {
    config.deleteProject(projectName);
    await config.save();
    ui.logSuccess(`Project '${projectName}' removed`);
  } else {
    ui.logInfo('Operation cancelled');
  }
}

async function interactiveProjectMenu() {
  ui.showHeader('📁 UPN CLI Project Management');

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: '📋 List all projects', value: 'list' },
        { name: '⚙️ Setup new project', value: 'setup' },
        { name: '📊 Check project status', value: 'status' },
        { name: '🗑️ Remove project', value: 'remove' }
      ]
    }
  ]);

  switch (action) {
    case 'list':
      await listProjects();
      break;
    case 'setup':
      await setupProject();
      break;
    case 'status':
      await showProjectStatus();
      break;
    case 'remove':
      await removeProject();
      break;
  }
}

module.exports = projectCommand;
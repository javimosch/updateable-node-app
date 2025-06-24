const inquirer = require('inquirer');
const path = require('path');
const fs = require('fs').promises;
const chalk = require('chalk');
const config = require('../utils/config');
const ui = require('../utils/ui');
const setupCommand = require('./setup');
const deployCommand = require('./deploy');
const logsCommand = require('./logs');
const projectCommand = require('./project');

async function interactiveMenu() {
  try {
    // Load existing config
    await config.load();

    ui.showHeader('UPN CLI - Interactive Mode');

    await mainMenuLoop();

  } catch (error) {
    ui.logError(`Interactive menu failed: ${error.message}`);
    process.exit(1);
  }
}

async function mainMenuLoop() {
  // Get list of configured projects
  const projects = config.listProjects();
  
  // Main menu options
  const mainChoices = [
    { name: 'Project Management', value: 'projects' },
    { name: 'Deploy Application', value: 'deploy' },
    { name: 'View Logs', value: 'logs' },
    { name: 'Setup New Project', value: 'setup' },
    { name: 'Exit', value: 'exit' }
  ];

  while (true) {
    console.log(''); // Add spacing
    
    // Show quick project status if any projects exist
    if (projects.length > 0) {
      ui.logInfo(`You have ${projects.length} configured project(s)`);
    } else {
      ui.logInfo('No projects configured yet. Start by setting up a project!');
    }

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: mainChoices,
        pageSize: 10
      }
    ]);

    switch (action) {
      case 'projects':
        await handleProjectManagement();
        break;
      case 'deploy':
        await handleDeploy();
        break;
      case 'logs':
        const shouldContinue = await handleLogs();
        if (!shouldContinue) {
          // User exited logs, continue main menu
          ui.logInfo('Returned to main menu');
        }
        break;
      case 'setup':
        await handleSetup();
        break;
      case 'exit':
        ui.logInfo('Goodbye!');
        process.exit(0);
        break;
    }
  }
}

async function handleProjectManagement() {
  const projectChoices = [
    { name: 'List all projects', value: 'list' },
    { name: 'Setup new project', value: 'setup' },
    { name: 'Check project status', value: 'status' },
    { name: 'Remove project', value: 'remove' },
    { name: 'Back to main menu', value: 'back' }
  ];

  const { projectAction } = await inquirer.prompt([
    {
      type: 'list',
      name: 'projectAction',
      message: 'Project Management:',
      choices: projectChoices
    }
  ]);

  if (projectAction === 'back') {
    return;
  }

  await projectCommand(projectAction);
}

async function handleDeploy() {
  const projects = config.listProjects();
  
  if (projects.length === 0) {
    ui.logWarning('No projects configured. Please setup a project first.');
    const { shouldSetup } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'shouldSetup',
        message: 'Would you like to setup a project now?',
        default: true
      }
    ]);
    
    if (shouldSetup) {
      await handleSetup();
    }
    return;
  }

  // Choose between existing project or new folder
  const deployChoices = [
    ...projects.map(project => ({
      name: `${project} (configured)`,
      value: { type: 'existing', project }
    })),
    { name: 'Browse for folder...', value: { type: 'browse' } },
    { name: 'Back to main menu', value: { type: 'back' } }
  ];

  const { deployChoice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'deployChoice',
      message: 'Select project to deploy:',
      choices: deployChoices
    }
  ]);

  if (deployChoice.type === 'back') {
    return;
  }

  let appFolder;
  if (deployChoice.type === 'existing') {
    appFolder = deployChoice.project;
  } else {
    const { folderPath } = await inquirer.prompt([
      {
        type: 'input',
        name: 'folderPath',
        message: 'Enter path to application folder:',
        default: '.',
        validate: async (input) => {
          try {
            await fs.access(input);
            return true;
          } catch {
            return 'Folder does not exist. Please enter a valid path.';
          }
        }
      }
    ]);
    appFolder = folderPath;
  }

  await deployCommand(appFolder);
}

async function handleLogs() {
  const projects = config.listProjects();
  
  if (projects.length === 0) {
    ui.logWarning('No projects configured. Please setup a project first.');
    return true; // Continue main menu
  }

  const logChoices = [
    ...projects.map(project => ({
      name: project,
      value: { type: 'existing', project }
    })),
    { name: 'Browse for folder...', value: { type: 'browse' } },
    { name: 'Back to main menu', value: { type: 'back' } }
  ];

  const { logChoice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'logChoice',
      message: 'Select project to view logs:',
      choices: logChoices
    }
  ]);

  if (logChoice.type === 'back') {
    return true; // Continue main menu
  }

  let appFolder;
  if (logChoice.type === 'existing') {
    appFolder = logChoice.project;
  } else {
    const { folderPath } = await inquirer.prompt([
      {
        type: 'input',
        name: 'folderPath',
        message: 'Enter path to application folder:',
        default: '.',
        validate: async (input) => {
          try {
            await fs.access(input);
            return true;
          } catch {
            return 'Folder does not exist. Please enter a valid path.';
          }
        }
      }
    ]);
    appFolder = folderPath;
  }

  // Ask for log options
  const { filterLogs } = await inquirer.prompt([
    {
      type: 'input',
      name: 'filterLogs',
      message: 'Filter logs by pattern (optional):',
      default: ''
    }
  ]);

  const options = {
    follow: true, // Always follow in interactive mode
    filter: filterLogs || undefined
  };

  // Start log streaming with custom handling for interactive mode
  return await startLogStreamingInteractive(appFolder, options);
}

async function handleSetup() {
  const { folderPath } = await inquirer.prompt([
    {
      type: 'input',
      name: 'folderPath',
      message: 'Enter path to application folder to setup:',
      default: '.',
      validate: async (input) => {
        try {
          await fs.access(input);
          return true;
        } catch {
          return 'Folder does not exist. Please enter a valid path.';
        }
      }
    }
  ]);

  await setupCommand(folderPath);
}

async function startLogStreamingInteractive(appFolder, options) {
  try {
    // Determine project name from folder
    const projectName = path.basename(path.resolve(appFolder));
    const projectConfig = config.getProjectConfig(projectName);

    // Check if project is configured
    if (!projectConfig.serverUrl) {
      ui.showErrorWithSuggestions(
        'Project not configured. Server URL is required.',
        [
          'Use the Setup New Project option to configure the project',
          'Set the server URL and bearer token if required'
        ]
      );
      return true; // Continue main menu
    }

    // Create API client
    const APIClient = require('../utils/api');
    const api = new APIClient(projectConfig.serverUrl, projectConfig.bearerToken);

    // Test connection first
    ui.logLoading('Connecting to server...');
    try {
      const isConnected = await api.testConnection();
      if (!isConnected) {
        throw new Error('Connection test failed');
      }
      ui.logSuccess('Connected to server successfully');
    } catch (error) {
      ui.showErrorWithSuggestions(
        `Cannot connect to server: ${error.message}`,
        [
          'Check if the server is running',
          'Verify the server URL is correct',
          'Check your network connection'
        ]
      );
      return true; // Continue main menu
    }

    // Get current status
    try {
      const status = await api.getStatus();
      if (status.running) {
        ui.logSuccess('Application is running');
      } else {
        ui.logWarning('Application is not running');
      }
    } catch (statusError) {
      ui.logWarning('Could not get application status');
    }

    // Start log streaming with interactive mode handling
    ui.logInfo('Starting log stream...');
    console.log(chalk.yellow('Press Ctrl+C to return to main menu'));
    console.log(chalk.gray('----------------------------------------'));

    return new Promise((resolve) => {
      let reconnectAttempts = 0;
      const maxReconnectAttempts = options.follow ? 5 : 0;
      let ws = null;

      // Set up Ctrl+C handler for returning to main menu
      const originalSigintHandlers = process.listeners('SIGINT');
      
      function handleSigint() {
        console.log('\n');
        ui.logInfo('Closing log stream...');
        if (ws) {
          ws.close();
        }
        // Remove our handler and restore original ones
        process.removeAllListeners('SIGINT');
        originalSigintHandlers.forEach(handler => {
          process.on('SIGINT', handler);
        });
        resolve(true); // Return to main menu
      }

      // Remove existing SIGINT handlers temporarily
      process.removeAllListeners('SIGINT');
      process.on('SIGINT', handleSigint);

      function connectToLogs() {
        ws = api.connectToLogs(
          (message) => {
            // Reset reconnect attempts on successful message
            reconnectAttempts = 0;
            
            // Apply syntax highlighting and formatting
            const formattedMessage = formatLogMessage(message, options);
            if (formattedMessage) {
              process.stdout.write(formattedMessage);
            }
          },
          (error) => {
            ui.logError(`WebSocket error: ${error.message}`);
            if (options.follow && reconnectAttempts < maxReconnectAttempts) {
              reconnectAttempts++;
              ui.logInfo(`Attempting to reconnect... (${reconnectAttempts}/${maxReconnectAttempts})`);
              setTimeout(connectToLogs, 2000); // Retry after 2 seconds
            } else {
              handleSigint(); // Return to main menu
            }
          },
          () => {
            if (options.follow && reconnectAttempts < maxReconnectAttempts) {
              reconnectAttempts++;
              ui.logInfo(`Connection closed. Attempting to reconnect... (${reconnectAttempts}/${maxReconnectAttempts})`);
              setTimeout(connectToLogs, 2000); // Retry after 2 seconds
            } else {
              ui.logInfo('Log stream ended');
              handleSigint(); // Return to main menu
            }
          }
        );
      }

      connectToLogs();
    });

  } catch (error) {
    ui.logError(`Log streaming failed: ${error.message}`);
    return true; // Continue main menu
  }
}

function formatLogMessage(message, options = {}) {
  // Remove any existing color codes for clean processing
  const cleanMessage = message.replace(/\x1b\[[0-9;]*m/g, '');
  
  // Apply filtering if specified
  if (options.filter && !cleanMessage.toLowerCase().includes(options.filter.toLowerCase())) {
    return '';
  }

  // Apply syntax highlighting based on log level and content
  if (cleanMessage.includes('[SYSTEM]')) {
    return chalk.cyan(message);
  } else if (cleanMessage.includes('ERROR') || cleanMessage.includes('error')) {
    return chalk.red(message);
  } else if (cleanMessage.includes('WARN') || cleanMessage.includes('warn')) {
    return chalk.yellow(message);
  } else if (cleanMessage.includes('INFO') || cleanMessage.includes('info')) {
    return chalk.blue(message);
  } else if (cleanMessage.includes('DEBUG') || cleanMessage.includes('debug')) {
    return chalk.gray(message);
  } else if (cleanMessage.includes('SUCCESS') || cleanMessage.includes('success')) {
    return chalk.green(message);
  }

  // Default formatting with timestamp highlighting
  const timestampRegex = /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z|\d{2}:\d{2}:\d{2})/;
  if (timestampRegex.test(cleanMessage)) {
    return message.replace(timestampRegex, chalk.gray('$1'));
  }

  return message;
}

module.exports = interactiveMenu;
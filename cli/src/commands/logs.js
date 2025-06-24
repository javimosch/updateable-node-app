const path = require('path');
const chalk = require('chalk');
const config = require('../utils/config');
const ui = require('../utils/ui');
const APIClient = require('../utils/api');

async function logsCommand(appFolder, options = {}) {
  try {
    // Load existing config
    await config.load();

    // Determine project name from folder
    const projectName = path.basename(path.resolve(appFolder));
    const projectConfig = config.getProjectConfig(projectName);

    ui.showHeader(`📋 UPN CLI Logs - ${projectName}`);

    // Check if project is configured
    if (!projectConfig.serverUrl) {
      ui.showErrorWithSuggestions(
        'Project not configured. Server URL is required.',
        [
          `Run 'upncli setup ${appFolder}' to configure the project`,
          'Set the server URL and bearer token if required'
        ]
      );
      process.exit(1);
    }

    // Create API client
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
      process.exit(1);
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

    // Start log streaming
    ui.logInfo('Starting log stream... (Press Ctrl+C to exit)');
    console.log(chalk.gray('─'.repeat(80)));

    let reconnectAttempts = 0;
    const maxReconnectAttempts = options.follow ? 5 : 0;

    function connectToLogs() {
      const ws = api.connectToLogs(
        (message) => {
          // Reset reconnect attempts on successful message
          reconnectAttempts = 0;
          
          // Apply syntax highlighting and formatting
          const formattedMessage = formatLogMessage(message, options);
          process.stdout.write(formattedMessage);
        },
        (error) => {
          ui.logError(`WebSocket error: ${error.message}`);
          if (options.follow && reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            ui.logInfo(`Attempting to reconnect... (${reconnectAttempts}/${maxReconnectAttempts})`);
            setTimeout(connectToLogs, 2000); // Retry after 2 seconds
          }
        },
        () => {
          if (options.follow && reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            ui.logInfo(`Connection closed. Attempting to reconnect... (${reconnectAttempts}/${maxReconnectAttempts})`);
            setTimeout(connectToLogs, 2000); // Retry after 2 seconds
          } else {
            ui.logInfo('Log stream ended');
            process.exit(0);
          }
        }
      );

      // Handle Ctrl+C gracefully
      process.on('SIGINT', () => {
        console.log('\n');
        ui.logInfo('Closing log stream...');
        ws.close();
        process.exit(0);
      });

      return ws;
    }

    connectToLogs();

  } catch (error) {
    ui.logError(`Logs command failed: ${error.message}`);
    process.exit(1);
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

module.exports = logsCommand;
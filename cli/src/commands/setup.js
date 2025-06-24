const inquirer = require('inquirer');
const path = require('path');
const fs = require('fs').promises;
const config = require('../utils/config');
const ui = require('../utils/ui');
const APIClient = require('../utils/api');

async function setupCommand(appFolder, options = {}) {
  try {
    // Load existing config
    await config.load();

    // Determine project name from folder
    const projectName = path.basename(path.resolve(appFolder));
    const projectConfig = config.getProjectConfig(projectName);

    ui.showHeader(`🚀 UPN CLI Setup - ${projectName}`);

    // Check if app folder exists
    try {
      await fs.access(appFolder);
      ui.logSuccess(`App folder found: ${appFolder}`);
    } catch (error) {
      ui.logError(`App folder not found: ${appFolder}`);
      process.exit(1);
    }

    // Interactive setup options
    const setupChoices = [
      {
        name: '📤 Upload blacklist patterns',
        value: 'blacklist',
        checked: false
      },
      {
        name: '🔑 Set bearer token',
        value: 'bearer',
        checked: false
      },
      {
        name: '🗑️  Clear existing token',
        value: 'clearBearer',
        checked: false
      },
      {
        name: '🌐 Set server base URL',
        value: 'serverUrl',
        checked: false
      }
    ];

    const { selectedOptions } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selectedOptions',
        message: 'Select configuration options:',
        choices: setupChoices
      }
    ]);

    // Process each selected option
    for (const option of selectedOptions) {
      switch (option) {
        case 'blacklist':
          await setupBlacklist(projectName, projectConfig);
          break;
        case 'bearer':
          await setupBearerToken(projectName, projectConfig);
          break;
        case 'clearBearer':
          await clearBearerToken(projectName, projectConfig);
          break;
        case 'serverUrl':
          await setupServerUrl(projectName, projectConfig);
          break;
      }
    }

    // Save configuration
    await config.save();

    // Test connection if server URL is configured
    if (projectConfig.serverUrl) {
      ui.logLoading('Testing connection to server...');
      const api = new APIClient(projectConfig.serverUrl, projectConfig.bearerToken);
      
      try {
        const isConnected = await api.testConnection();
        if (isConnected) {
          ui.logSuccess('Successfully connected to server!');
        } else {
          ui.logWarning('Could not connect to server. Please check the URL and try again.');
        }
      } catch (error) {
        ui.logWarning(`Connection test failed: ${error.message}`);
      }
    }

    ui.logSuccess(`Setup completed for project: ${projectName}`);
    
    // Show current configuration
    console.log('\nCurrent configuration:');
    console.log(`  Server URL: ${projectConfig.serverUrl || 'Not set'}`);
    console.log(`  Bearer Token: ${projectConfig.bearerToken ? '***configured***' : 'Not set'}`);
    console.log(`  Blacklist patterns: ${projectConfig.blacklist.length} patterns`);

  } catch (error) {
    ui.logError(`Setup failed: ${error.message}`);
    process.exit(1);
  }
}

async function setupBlacklist(projectName, projectConfig) {
  ui.logInfo('Current blacklist patterns:');
  projectConfig.blacklist.forEach((pattern, index) => {
    console.log(`  ${index + 1}. ${pattern}`);
  });

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: 'Add new pattern', value: 'add' },
        { name: 'Remove pattern', value: 'remove' },
        { name: 'Clear all patterns', value: 'clear' },
        { name: 'Keep current patterns', value: 'keep' }
      ]
    }
  ]);

  switch (action) {
    case 'add':
      const { newPattern } = await inquirer.prompt([
        {
          type: 'input',
          name: 'newPattern',
          message: 'Enter pattern to blacklist (e.g., "dist", "*.log"):',
          validate: (input) => input.trim().length > 0 || 'Pattern cannot be empty'
        }
      ]);
      projectConfig.blacklist.push(newPattern.trim());
      config.updateProjectConfig(projectName, { blacklist: projectConfig.blacklist });
      ui.logSuccess(`Added pattern: ${newPattern}`);
      break;

    case 'remove':
      if (projectConfig.blacklist.length === 0) {
        ui.logWarning('No patterns to remove');
        break;
      }
      
      const { patternToRemove } = await inquirer.prompt([
        {
          type: 'list',
          name: 'patternToRemove',
          message: 'Select pattern to remove:',
          choices: projectConfig.blacklist.map((pattern, index) => ({
            name: pattern,
            value: index
          }))
        }
      ]);
      
      const removedPattern = projectConfig.blacklist.splice(patternToRemove, 1)[0];
      config.updateProjectConfig(projectName, { blacklist: projectConfig.blacklist });
      ui.logSuccess(`Removed pattern: ${removedPattern}`);
      break;

    case 'clear':
      projectConfig.blacklist = [];
      config.updateProjectConfig(projectName, { blacklist: [] });
      ui.logSuccess('Cleared all blacklist patterns');
      break;

    case 'keep':
      ui.logInfo('Keeping current patterns');
      break;
  }
}

async function setupBearerToken(projectName, projectConfig) {
  const { token } = await inquirer.prompt([
    {
      type: 'password',
      name: 'token',
      message: 'Enter bearer token:',
      mask: '*',
      validate: (input) => input.trim().length > 0 || 'Token cannot be empty'
    }
  ]);

  config.updateProjectConfig(projectName, { bearerToken: token.trim() });
  ui.logSuccess('Bearer token updated');
}

async function clearBearerToken(projectName, projectConfig) {
  config.updateProjectConfig(projectName, { bearerToken: null });
  ui.logSuccess('Bearer token cleared');
}

async function setupServerUrl(projectName, projectConfig) {
  const { url } = await inquirer.prompt([
    {
      type: 'input',
      name: 'url',
      message: 'Enter server URL:',
      default: projectConfig.serverUrl || 'http://localhost:3888',
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

  // Remove trailing slash
  const cleanUrl = url.replace(/\/$/, '');
  config.updateProjectConfig(projectName, { serverUrl: cleanUrl });
  ui.logSuccess(`Server URL updated: ${cleanUrl}`);
}

module.exports = setupCommand;
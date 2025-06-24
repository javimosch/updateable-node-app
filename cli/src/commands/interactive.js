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
          await handleLogs();
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

  } catch (error) {
    ui.logError(`Interactive menu failed: ${error.message}`);
    process.exit(1);
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
    return;
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
    return;
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
  const { followLogs, filterLogs } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'followLogs',
      message: 'Follow logs in real-time? (with auto-reconnect)',
      default: true
    },
    {
      type: 'input',
      name: 'filterLogs',
      message: 'Filter logs by pattern (optional):',
      default: ''
    }
  ]);

  const options = {
    follow: followLogs,
    filter: filterLogs || undefined
  };

  await logsCommand(appFolder, options);
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

module.exports = interactiveMenu;
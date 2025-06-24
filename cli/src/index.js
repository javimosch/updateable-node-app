#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const ui = require('./utils/ui');
const setupCommand = require('./commands/setup');
const deployCommand = require('./commands/deploy');
const logsCommand = require('./commands/logs');
const projectCommand = require('./commands/project');
const interactiveMenu = require('./commands/interactive');

const program = new Command();

// CLI metadata
program
  .name('upncli')
  .description('CLI tool for UPN (Updateable Node.js) container management')
  .version('1.0.0');

// Global error handler
process.on('uncaughtException', (error) => {
  ui.logError(`Uncaught exception: ${error.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  ui.logError(`Unhandled rejection: ${reason}`);
  process.exit(1);
});

// Setup command
program
  .command('setup <appFolder>')
  .description('Interactive configuration setup for a project')
  .action(async (appFolder, options) => {
    await setupCommand(appFolder, options);
  });

// Deploy command
program
  .command('deploy <appFolder>')
  .description('Deploy application to UPN server')
  .option('-f, --force', 'Force deployment without confirmation')
  .action(async (appFolder, options) => {
    await deployCommand(appFolder, options);
  });

// Logs command
program
  .command('logs <appFolder>')
  .description('View application logs')
  .option('-f, --follow', 'Follow log output (auto-reconnect on disconnection)', false)
  .option('--filter <pattern>', 'Filter logs by pattern')
  .action(async (appFolder, options) => {
    await logsCommand(appFolder, options);
  });

// Project management commands
program
  .command('project [action] [name]')
  .description('Manage projects (list, setup, status, remove)')
  .action(async (action, name, options) => {
    await projectCommand(action, name, options);
  });

// Add some helpful aliases
program
  .command('ls')
  .description('List all configured projects (alias for "project list")')
  .action(async () => {
    await projectCommand('list');
  });

program
  .command('status [projectName]')
  .description('Show project status (alias for "project status")')
  .action(async (projectName) => {
    await projectCommand('status', projectName);
  });

// Help customization
program.configureHelp({
  sortSubcommands: true,
  subcommandTerm: (cmd) => cmd.name() + ' ' + cmd.usage()
});

// Custom help
program.on('--help', () => {
  console.log('');
  console.log('Examples:');
  console.log('  $ upncli setup my-app              # Configure project');
  console.log('  $ upncli deploy my-app             # Deploy application');
  console.log('  $ upncli logs my-app --follow      # Stream logs with auto-reconnect');
  console.log('  $ upncli project list              # List all projects');
  console.log('  $ upncli project setup admin-dash  # Setup specific project');
  console.log('  $ upncli status my-app             # Check project status');
  console.log('');
  console.log('Status Indicators:');
  console.log(`  ${ui.constructor.STATUS.SUCCESS} Success`);
  console.log(`  ${ui.constructor.STATUS.ERROR} Error`);
  console.log(`  ${ui.constructor.STATUS.WARNING} Warning`);
  console.log(`  ${ui.constructor.STATUS.LOADING} Loading/Processing`);
  console.log(`  ${ui.constructor.STATUS.UPLOADING} Uploading`);
  console.log('');
  console.log('Configuration:');
  console.log('  Config files are stored in ~/.upncli/config.json');
  console.log('  Each project can have its own server URL and bearer token');
  console.log('  Blacklist patterns support glob syntax (e.g., "*.log", "dist/**")');
  console.log('');
});

// Check if no arguments provided before parsing
if (!process.argv.slice(2).length) {
  // Start interactive mode
  interactiveMenu();
} else {
  // Parse command line arguments for direct commands
  program.parse();
}
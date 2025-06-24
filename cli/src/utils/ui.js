const chalk = require('chalk');
const boxen = require('boxen');
const cliProgress = require('cli-progress');

class UIHelper {
  constructor() {
    this.progressBar = null;
  }

  // Emoji status indicators
  static STATUS = {
    SUCCESS: '✅',
    ERROR: '❌',
    WARNING: '⚠️',
    INFO: 'ℹ️',
    LOADING: '⏳',
    UPLOADING: '📤',
    DOWNLOADING: '📥',
    ROCKET: '🚀',
    GEAR: '⚙️',
    FOLDER: '📁',
    FILE: '📄'
  };

  // Color helpers
  success(text) {
    return chalk.green(`${UIHelper.STATUS.SUCCESS} ${text}`);
  }

  error(text) {
    return chalk.red(`${UIHelper.STATUS.ERROR} ${text}`);
  }

  warning(text) {
    return chalk.yellow(`${UIHelper.STATUS.WARNING} ${text}`);
  }

  info(text) {
    return chalk.blue(`${UIHelper.STATUS.INFO} ${text}`);
  }

  loading(text) {
    return chalk.cyan(`${UIHelper.STATUS.LOADING} ${text}`);
  }

  uploading(text) {
    return chalk.magenta(`${UIHelper.STATUS.UPLOADING} ${text}`);
  }

  // Header with ASCII art
  showHeader(title) {
    const header = boxen(chalk.bold.cyan(title), {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: 'cyan'
    });
    console.log(header);
  }

  // Progress bar for uploads
  createProgressBar(total = 100) {
    this.progressBar = new cliProgress.SingleBar({
      format: `${UIHelper.STATUS.UPLOADING} Upload Progress |${chalk.cyan('{bar}')}| {percentage}% | {value}/{total} | ETA: {eta}s`,
      barCompleteChar: '█',
      barIncompleteChar: '░',
      hideCursor: true
    });
    this.progressBar.start(total, 0);
    return this.progressBar;
  }

  updateProgress(value) {
    if (this.progressBar) {
      this.progressBar.update(value);
    }
  }

  stopProgress() {
    if (this.progressBar) {
      this.progressBar.stop();
      this.progressBar = null;
    }
  }

  // Status messages
  logSuccess(message) {
    console.log(this.success(message));
  }

  logError(message) {
    console.log(this.error(message));
  }

  logWarning(message) {
    console.log(this.warning(message));
  }

  logInfo(message) {
    console.log(this.info(message));
  }

  logLoading(message) {
    console.log(this.loading(message));
  }

  logUploading(message) {
    console.log(this.uploading(message));
  }

  // Formatted lists
  showList(items, title = null) {
    if (title) {
      console.log(chalk.bold.underline(title));
    }
    items.forEach((item, index) => {
      console.log(`  ${index + 1}. ${item}`);
    });
  }

  // Project status display
  showProjectStatus(projectName, config, isActive = false) {
    const status = isActive ? chalk.green('(active)') : chalk.gray('(inactive)');
    const url = config.serverUrl || 'No URL configured';
    console.log(`  ${UIHelper.STATUS.FOLDER} ${chalk.bold(projectName)} ${status} - ${chalk.blue(url)}`);
  }

  // Error with suggestions
  showErrorWithSuggestions(error, suggestions = []) {
    this.logError(error);
    if (suggestions.length > 0) {
      console.log(chalk.yellow('\nSuggestions:'));
      suggestions.forEach(suggestion => {
        console.log(`  ${UIHelper.STATUS.INFO} ${suggestion}`);
      });
    }
  }

  // Validation messages
  validateAndShow(condition, successMsg, errorMsg, suggestions = []) {
    if (condition) {
      this.logSuccess(successMsg);
      return true;
    } else {
      this.showErrorWithSuggestions(errorMsg, suggestions);
      return false;
    }
  }
}

module.exports = new UIHelper();
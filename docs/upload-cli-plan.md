# UPN CLI Plan (`upncli`)

## Project Structure
```
cli/
├── src/
│   ├── commands/          # Command implementations
│   │   ├── setup.js       # Interactive configuration
│   │   ├── deploy.js      # Deployment logic
│   │   ├── logs.js        # Log viewing
│   │   └── project.js     # Project management
│   ├── utils/
│   │   ├── config.js      # Configuration management
│   │   ├── ui.js          # Rich terminal UI components
│   │   └── api.js         # API communication
│   └── index.js           # Main entry point
├── bin/
│   └── upncli             # Executable entry point
├── package.json           # CLI dependencies
└── README.md              # Usage documentation
```

## Core Features

### 1. Interactive Setup (`upncli setup {appFolder}`)
```bash
? Select configuration options:
  ◯ Upload blacklist patterns
  ◯ Set bearer token
  ◯ Clear existing token
  ◯ Set server base URL
```

### 2. Smart Deployment (`upncli deploy {appFolder}`)
- Auto-detects setup requirements
- Creates optimized zip package
- Shows real-time upload progress
- Uses emoji status indicators: ⏳ → 📤 → ✅

### 3. Log Streaming (`upncli logs --follow {appFolder}`)
- Real-time log following with syntax highlighting
- Filtering capabilities
- Auto-reconnect on disconnection

### 4. Project Management (`upncli project`)
```bash
$ upncli project list
  my-app (active) - http://localhost:3000
  admin-dashboard - https://admin.example.com

$ upncli project setup admin-dashboard
```

## Technical Implementation

### UI Components (utils/ui.js)
- Emoji status indicators (✅ ❌ ⚠️)
- Interactive prompts with `inquirer`
- Progress bars with `cli-progress`
- Colorful output with `chalk`
- ASCII art headers

### Configuration System
- Stores configs in `~/.upncli/config.json`
- Per-project configuration:
  ```json
  {
    "projects": {
      "my-app": {
        "serverUrl": "http://localhost:3000",
        "bearerToken": "sec-ret-tok-en",
        "blacklist": ["node_modules", ".git"]
      }
    }
  }
  ```

### Deployment Workflow
1. Validate app folder exists
2. Check/create configuration
3. Create zip package with exclusions
4. Upload with progress reporting
5. Handle server response with emoji feedback

### Error Handling
- Graceful failure with ❌ emoji
- Detailed error explanations
- Recovery suggestions
- Config validation

## Development Timeline

### Phase 1: Core Functionality
1. Project scaffolding
2. Configuration system
3. Basic deployment flow

### Phase 2: UI Enhancement
1. Interactive prompts
2. Emoji status system
3. Progress indicators

### Phase 3: Advanced Features
1. Log streaming
2. Project management
3. Auto-completion

### Phase 4: Optimization
1. Bundle size reduction
2. Performance tuning
3. Cross-platform testing

## Dependencies
- `commander` (CLI framework)
- `inquirer` (interactive prompts)
- `chalk` (terminal styling)
- `archiver` (zip creation)
- `axios` (HTTP requests)
- `ws` (WebSocket for logs)
- `boxen` (text boxes)
- `cli-progress` (progress bars)

## Existing upload script (`upload.sh`)

The existing upload.sh script (pseudo CLI) works OK and should be used as reference.
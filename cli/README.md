# UPN CLI (`upncli`)

A command-line interface for managing UPN (Updateable Node.js) containers with rich terminal UI, emoji status indicators, and smart deployment features.

## Installation

```bash
cd cli
npm install
npm link  # Makes 'upncli' available globally
```

## Quick Start

1. **Setup a project:**
   ```bash
   upncli setup my-app
   ```

2. **Deploy your application:**
   ```bash
   upncli deploy my-app
   ```

3. **Stream logs:**
   ```bash
   upncli logs my-app --follow
   ```

## Commands

### `upncli setup <appFolder>`
Interactive configuration setup for a project.

**Features:**
- ✅ Configure server URL
- 🔑 Set bearer token authentication
- 📤 Manage upload blacklist patterns
- 🧪 Test server connection

**Example:**
```bash
upncli setup my-node-app
```

### `upncli deploy <appFolder>`
Deploy application to UPN server with smart packaging.

**Features:**
- 📦 Auto-detects and validates app folder
- 🚫 Applies blacklist patterns for optimized packages
- 📊 Real-time upload progress with emoji indicators
- ✅ Automatic server connection testing
- 🔄 Zero-downtime deployment

**Options:**
- `-f, --force` - Force deployment without confirmation

**Example:**
```bash
upncli deploy my-node-app
upncli deploy my-node-app --force
```

### `upncli logs <appFolder>`
View and stream application logs with syntax highlighting.

**Features:**
- 🎨 Syntax highlighting for different log levels
- 🔄 Auto-reconnect on connection loss
- 🔍 Log filtering capabilities
- ⏱️ Real-time streaming

**Options:**
- `-f, --follow` - Follow log output with auto-reconnect
- `--filter <pattern>` - Filter logs by pattern

**Examples:**
```bash
upncli logs my-app                    # View recent logs
upncli logs my-app --follow           # Stream logs with auto-reconnect
upncli logs my-app --filter "error"   # Filter for error messages
```

### `upncli project [action] [name]`
Manage multiple projects and configurations.

**Actions:**
- `list` - List all configured projects
- `setup [name]` - Setup a new project configuration
- `status [name]` - Show detailed project status
- `remove [name]` - Remove project configuration

**Examples:**
```bash
upncli project list                   # List all projects
upncli project setup admin-dashboard # Setup specific project
upncli project status my-app         # Check project status
upncli project remove old-app        # Remove project config
```

### Aliases

- `upncli ls` - Alias for `project list`
- `upncli status [name]` - Alias for `project status`

## Configuration

### Global Configuration
Configuration is stored in `~/.upncli/config.json`:

```json
{
  "projects": {
    "my-app": {
      "serverUrl": "http://localhost:3888",
      "bearerToken": "your-secret-token",
      "blacklist": ["node_modules", ".git", "*.log", "dist"]
    },
    "admin-dashboard": {
      "serverUrl": "https://admin.example.com",
      "bearerToken": null,
      "blacklist": ["node_modules", ".git"]
    }
  }
}
```

### Per-Project Settings

Each project can have:
- **Server URL**: Target UPN server endpoint
- **Bearer Token**: Authentication token (optional)
- **Blacklist Patterns**: Files/folders to exclude from deployment

### Blacklist Patterns

Supports glob patterns for flexible exclusions:
- `node_modules` - Exclude node_modules folder
- `*.log` - Exclude all log files
- `dist/**` - Exclude entire dist directory
- `.env*` - Exclude environment files

## Status Indicators

The CLI uses emoji indicators for clear visual feedback:

- ✅ **Success** - Operation completed successfully
- ❌ **Error** - Operation failed
- ⚠️ **Warning** - Operation completed with warnings
- ℹ️ **Info** - Informational message
- ⏳ **Loading** - Operation in progress
- 📤 **Uploading** - File upload in progress
- 🚀 **Deployment** - Deployment operations
- ⚙️ **Configuration** - Setup and config operations

## Deployment Workflow

1. **Validation**: Checks app folder exists and project is configured
2. **Connection Test**: Verifies server connectivity
3. **Package Creation**: Creates optimized zip with blacklist exclusions
4. **Upload**: Uploads with real-time progress tracking
5. **Deployment**: Server extracts and starts the application
6. **Verification**: Confirms deployment success

## Error Handling

The CLI provides detailed error messages with helpful suggestions:

```bash
❌ Cannot connect to server: ECONNREFUSED
Suggestions:
  ℹ️ Check if the server is running
  ℹ️ Verify the server URL is correct
  ℹ️ Check your network connection
```

## Advanced Features

### Auto-Reconnect Logs
When using `--follow`, the CLI automatically reconnects if the connection is lost:

```bash
upncli logs my-app --follow
# Automatically reconnects up to 5 times on disconnection
```

### Smart Package Optimization
The CLI creates optimized deployment packages by:
- Excluding development dependencies
- Applying user-defined blacklist patterns
- Using maximum compression
- Validating package integrity

### Multi-Project Management
Easily switch between different projects and environments:

```bash
upncli project list
  📁 my-app (active) - http://localhost:3888
  📁 admin-dashboard - https://admin.example.com
  📁 api-server - http://api.local:3000
```

## Troubleshooting

### Common Issues

1. **Authentication Errors**
   ```bash
   upncli setup my-app  # Reconfigure bearer token
   ```

2. **Connection Issues**
   ```bash
   upncli project status my-app  # Test connectivity
   ```

3. **Large Package Uploads**
   - Review blacklist patterns to exclude unnecessary files
   - Check network stability for large uploads

### Debug Mode
For detailed debugging, check the server logs or use verbose npm logging:

```bash
DEBUG=* upncli deploy my-app
```

## Dependencies

- `commander` - CLI framework
- `inquirer` - Interactive prompts
- `chalk` - Terminal styling
- `archiver` - Zip creation
- `axios` - HTTP requests
- `ws` - WebSocket for logs
- `boxen` - Text boxes
- `cli-progress` - Progress bars

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with real UPN server
5. Submit a pull request

## License

MIT License - see LICENSE file for details.
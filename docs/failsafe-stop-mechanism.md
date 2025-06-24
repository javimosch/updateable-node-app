# Failsafe Stop Mechanism

## Overview

The failsafe stop mechanism ensures zero-downtime deployments by preventing multiple application versions from running simultaneously. It implements a three-tier termination strategy with automatic recovery capabilities to handle edge cases where subprocess termination fails.

## Problem Statement

During deployment, the system needs to:
1. Stop the currently running application
2. Deploy the new version
3. Start the new application

**Previous Issue**: The old `stopApp()` function would send a termination signal and immediately continue, causing both old and new versions to run concurrently during the transition period.

## Solution Architecture

### Three-Tier Termination Strategy

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Graceful      │    │     Force       │    │    Failsafe    │
│   Shutdown      │───▶│   Termination   │───▶│    Restart     │
│   (SIGTERM)     │    │   (SIGKILL)     │    │ (restart app)  │
│   10 seconds    │    │   +5 seconds    │    │   +3 seconds   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Implementation Details

#### 1. Graceful Shutdown (0-10 seconds)
- Sends `SIGTERM` signal to the subprocess
- Waits for the process to exit cleanly
- Allows application to perform cleanup operations
- Most processes terminate successfully at this stage

#### 2. Force Termination (10-15 seconds)
- If graceful shutdown fails, sends `SIGKILL` signal
- Forces immediate process termination
- Handles unresponsive or stuck processes
- Cannot be ignored by the target process

#### 3. Failsafe Restart (15+ seconds)
- **Last resort**: If `SIGKILL` fails (extremely rare)
- Notifies UI via WebSocket about impending restart
- Restarts the entire main application:
  - **Development (nodemon)**: Sends SIGUSR2 signal for immediate restart
  - **Production**: Uses `process.exit(1)` for process manager restart
- Ensures new deployment becomes active
- UI automatically refreshes and reconnects

## Development vs Production Restart

### Simplified Nodemon Restart
The system uses SIGUSR2 signal to restart nodemon directly:

```javascript
function restartApplication() {
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (!isProduction) {
    // Trigger nodemon restart via SIGUSR2 signal
    process.kill(process.pid, 'SIGUSR2');
  } else {
    // Production restart via process exit
    process.exit(1);
  }
}
```

### Nodemon Configuration
The system uses a simplified `nodemon.json` configuration file:

```json
{
  "watch": [
    "."
  ],
  "ignore": [
    "deployments/",
    "data/",
    "node_modules/"
  ],
  "ext": "js,json",
  "verbose": true,
  "env": {
    "NODE_ENV": "development"
  }
}
```

**Key Configuration Details:**
- **Simplified approach**: Uses SIGUSR2 signal instead of file watching
- **No special files**: No need to watch restart trigger files
- **Standard extensions**: Only watches `.js` and `.json` files
- **Clean configuration**: Minimal setup required

The `package.json` dev script is simplified:
```json
{
  "scripts": {
    "dev": "npx nodemon server.js"
  }
}
```

## Usage Scenarios

### 1. Normal Deployment
```
User uploads new version
├── stopApp() called
├── SIGTERM sent to old process
├── Process exits within 10 seconds ✅
├── New version extracted and configured
└── New version started
```

### 2. Stubborn Process
```
User uploads new version
├── stopApp() called
├── SIGTERM sent to old process
├── Process doesn't exit after 10 seconds
├── SIGKILL sent to force termination ⚡
├── Process exits within 5 seconds ✅
├── New version extracted and configured
└── New version started
```

### 3. Stuck Process (Failsafe Triggered)
```
User uploads new version
├── stopApp() called
├── SIGTERM sent to old process (fails)
├── SIGKILL sent to old process (fails)
├── UI notified of impending restart 📢
├── SIGUSR2 signal sent to nodemon 📡
├── Nodemon receives signal and restarts 🔄
├── New version becomes active ✅
└── UI reconnects to fresh instance
```

## Testing the Failsafe Mechanism

### Manual Testing

#### Method 1: Test Endpoint (Easiest)
1. Start the application with `npm run dev`
2. Open your browser to `http://localhost:3888`
3. Open browser console and run:
```javascript
fetch('/test-restart', { method: 'POST' })
  .then(r => r.json())
  .then(console.log);
```
4. Watch the server console for restart debug information

#### Method 2: Deployment Testing
1. Start the application with `npm run dev`
2. Deploy a new version via the web UI
3. Monitor the console output for the termination process

#### Method 3: Manual Signal Test
1. Start the application with `npm run dev`
2. Send SIGUSR2 signal manually:
```bash
# Find the nodemon process ID
ps aux | grep nodemon
# Send signal (replace PID with actual process ID)
kill -SIGUSR2 <nodemon_pid>
```
3. Watch nodemon restart the application

#### Method 4: Verify Nodemon Configuration
1. Start with `npm run dev` and check the verbose output
2. Look for lines like: `[nodemon] watching path(s): .`
3. Verify nodemon is running and responsive to signals

### Expected Behavior in Development
When the failsafe is triggered in development:
1. Console shows: "Non-production environment detected, trying nodemon SIGUSR2 restart..."
2. SIGUSR2 signal is sent to the current process
3. Nodemon receives the signal and restarts the application
4. UI automatically refreshes and shows logs from the new deployment

### Expected Debug Output
```
=== Restart Application Debug ===
NODE_ENV: development
Non-production environment detected, trying nodemon SIGUSR2 restart...
Sending SIGUSR2 signal to restart nodemon...
SIGUSR2 signal sent successfully
[nodemon] restarting due to SIGUSR2...
[nodemon] starting `node server.js`
```

## Configuration

### Timeouts

| Stage | Timeout | Configurable | Purpose |
|-------|---------|--------------|---------|
| Graceful Shutdown | 10 seconds | ❌ | Allow clean process exit |
| Force Termination | +5 seconds | ❌ | Wait for SIGKILL to take effect |
| UI Notification | +3 seconds | ❌ | Give UI time to show messages |
| SIGUSR2 Fallback | +3 seconds | ❌ | Fallback to process.exit if signal fails |

### Signal-Based Restart
- **SIGUSR2 signal**: Sent directly to nodemon process for immediate restart
- **No temporary files**: Clean approach without file system operations
- **Instant response**: Nodemon restarts immediately upon receiving signal
- **Automatic fallback**: Falls back to `process.exit(1)` if signal fails

## Troubleshooting

### Common Issues in Development

#### 1. SIGUSR2 Signal Not Working
**Symptoms**: Failsafe triggers but nodemon doesn't restart immediately
**Causes**: 
- Nodemon not running or not responding to signals
- Process not actually running under nodemon

**Solutions**:
- Verify nodemon is running with `ps aux | grep nodemon`
- Check that `npm run dev` is being used (not `node server.js`)
- Automatic fallback to `process.exit(1)` after 3 seconds

#### 2. Signal Permission Errors
**Symptoms**: "Failed to send SIGUSR2 signal" error
**Causes**:
- Insufficient permissions to send signals
- Process ID issues

**Solutions**:
- Automatic fallback to `process.exit(1)`
- Check process permissions
- Verify nodemon is running correctly

#### 3. Multiple Restarts
**Symptoms**: Application restarts multiple times
**Causes**:
- Signal sent multiple times
- Nodemon configuration issues

**Solutions**:
- Check for duplicate signal calls
- Review nodemon ignore patterns
- Monitor debug output for signal sending

## Best Practices

### 1. Development Setup
- Always use `npm run dev` for development to enable nodemon
- Monitor console output during deployments
- Test failsafe mechanism periodically
- Verify SIGUSR2 signal handling works

### 2. Application Design
- Implement proper signal handlers in your applications
- Handle `SIGTERM` gracefully by cleaning up resources
- Avoid blocking operations during shutdown

### 3. Deployment Strategy
- Test deployments in development first
- Monitor logs during deployment for any issues
- Keep deployment packages small for faster extraction

## Security Considerations

### Signal Handling
- SIGUSR2 signal is sent to current process only
- No external process control exposed
- Automatic fallback if signal operations fail

### Process Management
- Restart mechanism only affects the main application
- No file system operations required
- Clean signal-based approach

## Performance Impact

### Development Environment
- Minimal overhead: single signal operation
- Nodemon restart time: typically 1-2 seconds
- No file system operations or cleanup required

### Signal Operations
- Instant signal delivery
- No temporary files or cleanup needed
- Graceful fallback if signal fails

## Advantages of SIGUSR2 Approach

### Compared to File-Based Restart
✅ **Instant response**: No file system polling delays  
✅ **No file cleanup**: No temporary files to manage  
✅ **Simpler configuration**: Standard nodemon setup  
✅ **More reliable**: Direct signal communication  
✅ **Cleaner approach**: No file system dependencies  

### Implementation Benefits
- **Fewer moving parts**: Just signal handling
- **Better performance**: No file I/O operations
- **Easier debugging**: Clear signal flow
- **Standard approach**: Uses nodemon's built-in restart mechanism

## Conclusion

The enhanced failsafe stop mechanism now uses the clean and reliable SIGUSR2 signal approach for nodemon restarts. This eliminates file system dependencies, improves performance, and provides a more robust solution while maintaining the zero-downtime guarantee in all environments.

The simplified approach reduces complexity while improving reliability, making the system easier to maintain and debug.
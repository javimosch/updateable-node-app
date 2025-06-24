# Updateable Node.js Docker Container 

This project gives you a simple Docker container for running Node.js apps that you can update easily with a web UI or a command-line script. It's lightweight and flexible for deploying apps.

## Features 
- Web UI to manage your app.
- Update apps on the fly by uploading a zip file – no downtime needed!
- Saves your settings so they stick after restarts.
- Keeps up to 5 app versions for easy rollbacks.
- Shows real-time logs in the UI.
- Secured with basic login.
- Lets you handle environment variables right from the UI.
- Includes an interactive script for uploading apps.

## How to Use 
### 1. Build the Docker image
Run this command to build it:

```bash
docker build -t updateable-node-app .
```

### 2. Run the container
Start with default login (user: admin, pass: password) on port 3000:

```bash
docker run -p 3000:3000 -d --name my-node-app updateable-node-app
```

Or use custom login by setting environment variables:

```bash
docker run -p 3000:3000 -d -e WEBUI_USER=myuser -e WEBUI_PASSWORD=mypassword --name my-node-app updateable-node-app
```

### 3. Access the Web UI
Open your browser and go to `http://localhost:3000`. Log in with your username and password.

### 4. Using the Web UI
- **Configuration**: Set the app's run command (e.g., `node index.js`) – it saves automatically.
- **Upload App**: Upload a zip file of your Node.js app; it will start running right away.
- **Status**: Check if your app is running and when it was last updated.
- **Actions**: Start or stop your app manually.
- **Environment Settings**: Create, edit, or choose different env configs.
- **Logs**: Watch live output from your app.

### 5. Using the upload.sh script
This script makes uploading easy. First, make it executable:

```bash
chmod +x upload.sh
```

Then run it interactively:

```bash
./upload.sh
```

Or with arguments for quicker use:

```bash
./upload.sh <username> <password> <url>
```
It helps you pick a folder, zip it, and upload it.

## Project Structure 
- `Dockerfile`: Sets up the Docker image.
- `server.js`: Runs the web UI and API.
- `package.json`: Lists dependencies for the UI server.
- `public/`: Holds the web UI files (HTML, CSS, JS).
- `upload.sh`: Script for interactive uploads.
- `config.json`: Stores settings like run commands.
- `deployments/`: Keeps different app versions.
- `env-configs/`: Manages your .env files.
- `uploads/`: Temp folder for file uploads.

## How It Works 
The `server.js` app manages a child process for your Node.js app. When you upload a zip:
1. Stops the current app if running.
2. Makes a new folder for the update.
3. Unzips your file there.
4. Updates the config with the new path and date.
5. Removes old versions, keeping only the last 5.
6. Starts your app with the set command.

## Persistent Folders

This feature allows you to preserve specific folders across deployments and rollbacks. This is useful for preserving user-uploaded content, configuration files, or other data that should not be overwritten when deploying a new version.

### Configuration

You can configure persistent folders in two ways:

1. **Environment Variable**: Set the `PERSISTENT_FOLDERS` environment variable to a comma-separated list of folder names (e.g., `uploads,data,config`).

2. **UI Configuration**: In the web interface, under the "Configuration" section, there is an input field for "Persistent Folders". Enter a comma-separated list of folder names. The UI configuration takes precedence over the environment variable.

### How It Works

- **During Deployment/Rollback**:
  1. Before deploying a new version or rolling back, the current version's persistent folders are backed up to a special directory: `/data/persistent`.
  2. After the new version is deployed or the rollback is complete, the persistent folders are restored from `/data/persistent` to the new deployment directory.
  3. If the new deployment package (zip file) contains any of the persistent folders, they are removed before restoring from the backup to avoid conflicts.

- **Note**: The `/data/persistent` directory is created automatically and is not part of any deployment. It is solely used for storing the persistent folders during transitions.

## Handling Large Projects with node_modules

For projects with large dependencies (like React apps), follow this workaround to avoid uploading the heavy `node_modules` folder:

1. **Exclude node_modules** from your deployment zip file
2. **Add node_modules to persistent folders** in the UI or via `PERSISTENT_FOLDERS=node_modules` environment variable
3. **Upload** your application code without node_modules
4. **Set the startup commands** in this order:
   ```
   npm install
   npm run start
   ```

This will:
- Keep your deployment package small
- Preserve node_modules between deployments
- Automatically install any missing dependencies
- Ensure all required dependencies are present before launching the app

For custom scripts, replace with your package.json scripts (e.g. `npm run build` before `npm run start` for React apps)

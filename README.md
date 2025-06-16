# Updateable Node.js Docker Container 🚀

This project gives you a simple Docker container for running Node.js apps that you can update easily with a web UI or a command-line script. 😊 It's lightweight and flexible for deploying apps.

## Features 👍
- Web UI to manage your app.
- Update apps on the fly by uploading a zip file – no downtime needed!
- Saves your settings so they stick after restarts.
- Keeps up to 5 app versions for easy rollbacks.
- Shows real-time logs in the UI.
- Secured with basic login.
- Lets you handle environment variables right from the UI.
- Includes an interactive script for uploading apps.

## How to Use 👣
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

## Project Structure 📁
- `Dockerfile`: Sets up the Docker image.
- `server.js`: Runs the web UI and API.
- `package.json`: Lists dependencies for the UI server.
- `public/`: Holds the web UI files (HTML, CSS, JS).
- `upload.sh`: Script for interactive uploads.
- `config.json`: Stores settings like run commands.
- `deployments/`: Keeps different app versions.
- `env-configs/`: Manages your .env files.
- `uploads/`: Temp folder for file uploads.

## How It Works ⚙️
The `server.js` app manages a child process for your Node.js app. When you upload a zip:
1. Stops the current app if running.
2. Makes a new folder for the update.
3. Unzips your file there.
4. Updates the config with the new path and date.
5. Removes old versions, keeping only the last 5.
6. Starts your app with the set command.

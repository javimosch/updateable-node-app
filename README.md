# Updateable Node.js Docker Container

This project provides a Docker container that can run any Node.js application and be updated on the fly via a simple web UI or a command-line script.

It's designed to be a lightweight and flexible solution for deploying and managing Node.js applications in a containerized environment.

## Features

- **Web UI**: A simple web interface to manage the application.
- **On-the-fly Updates**: Upload a zip file of your Node.js application, and the container will automatically start running it.
- **Persistent Configuration**: The run command is saved in a `config.json` file and persists across container restarts.
- **Versioned Deployments**: The container keeps the last 5 deployments, making it possible to implement rollbacks in the future.
- **Real-time Logs**: View real-time `stdout` and `stderr` from your application in the web UI.
- **Basic Authentication**: The web UI is protected by basic authentication.
- **Environment Variable Management**: Configure and select different sets of environment variables for your application directly from the web UI.
- **Interactive Upload Script**: An interactive `upload.sh` script to easily package and upload your applications.

## How to use

### 1. Build the Docker image

```bash
docker build -t updateable-node-app .
```

### 2. Run the Docker container

You can run the container with default credentials (`admin`/`password`) on port `3000`:

```bash
docker run -p 3000:3000 -d --name my-node-app updateable-node-app
```

To use custom credentials, set the `WEBUI_USER` and `WEBUI_PASSWORD` environment variables:

```bash
docker run -p 3000:3000 -d \
  -e WEBUI_USER=myuser \
  -e WEBUI_PASSWORD=mypassword \
  --name my-node-app \
  updateable-node-app
```

### 3. Access the Web UI

Open your browser and navigate to `http://localhost:3000`. You will be prompted for the username and password.

### 4. Using the Web UI

- **Configuration**: Set the command to run your application (e.g., `npm run start`, `node index.js`). This is saved automatically.
- **Upload App**: Upload a `.zip` file containing your Node.js application, including `node_modules`. The container will stop the current application, extract the new one, and start it.
- **Status**: View the current status of the application (Running/Stopped) and the last upload date.
- **Actions**: Start or stop the application manually.
- **Environment Configurations**: Create, edit, delete, and select environment configurations. The selected configuration will be loaded into your application when it starts.
- **Logs**: View real-time logs from your application.

### 5. Using the `upload.sh` script

The `upload.sh` script provides an interactive way to upload your application.

Make it executable:
```bash
chmod +x upload.sh
```

Run it:
```bash
./upload.sh
```

You can also provide credentials and the URL as arguments:
```bash
./upload.sh <username> <password> <url>
```

The script will guide you through selecting a base path and a folder to zip and upload.

## Project Structure

- `Dockerfile`: Defines the Docker image.
- `server.js`: The Node.js/Express server for the web UI and API.
- `package.json`: Dependencies for the web UI server.
- `public/`: Static files for the web UI (HTML, CSS, JS).
- `upload.sh`: Interactive script to upload applications.
- `config.json` (generated): Stores the persistent configuration (run command, selected env, etc.).
- `deployments/` (generated): Stores the versioned deployments.
- `env-configs/` (generated): Stores your `.env.*` configuration files.
- `uploads/` (generated): Temporary directory for uploads.

## How it works

The `server.js` application provides a web UI and an API to manage a child process. When you upload a zip file, the server:
1. Stops the currently running application (if any).
2. Creates a new timestamped directory in `deployments/`.
3. Extracts the contents of the zip file into the new directory.
4. Updates `config.json` with the path to the new deployment and the upload date.
5. Prunes old deployments, keeping only the last 5.
6. Starts the new application using the configured command.

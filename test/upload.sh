#!/bin/bash

# Default values
USERNAME=${1:-admin}
PASSWORD=${2:-password}
URL=${3:-http://localhost:3000/upload}

# Zip the current directory
zip -r app.zip . -x "*.git*"

# Upload with progress bar
curl -u "$USERNAME:$PASSWORD" -F "file=@app.zip" "$URL" --progress-bar

# Clean up
rm app.zip
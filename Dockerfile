FROM node:alpine

# Install unzip for extracting uploaded zip files
RUN apk add --no-cache unzip

# Set working directory for the web UI
WORKDIR /app

# Copy the web UI code (server.js and package.json will be provided separately)
COPY . .

# Install dependencies for the web UI
RUN npm install

# Expose the port for the web UI
EXPOSE 3888

# Run the web UI server
CMD ["node", "server.js"]
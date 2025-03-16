FROM node:20-alpine

# Install required packages for building native modules
RUN apk add --no-cache openssh make gcc g++ python3

# Set the working directory
WORKDIR /usr/src/backend

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application code
COPY . .

# Increase memory for Node.js during build
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Build the application
RUN npm run build

# Expose the port
EXPOSE 8080

# Start the application
CMD ["npm", "start"]

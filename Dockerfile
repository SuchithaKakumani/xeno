FROM node:18-alpine

# Set node environment to production by default
ENV NODE_ENV=production
ENV PORT=3000

# Create application directory
WORKDIR /usr/src/app

# Copy dependency files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy application source code
COPY . .

# Create necessary runtime directories
RUN mkdir -p uploads output data logs

# Expose port
EXPOSE 3000

# Run server.js
CMD ["node", "server.js"]

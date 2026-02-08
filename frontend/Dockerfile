FROM node:20-slim

WORKDIR /app

# Copy package files first (for Docker layer caching)
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install

# Copy application code
COPY . .

# Expose port
EXPOSE 3000

# Run in dev mode with hot reload
CMD ["npm", "run", "dev"]

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

# Build at startup so NEXT_PUBLIC_* env vars (set by Azure Container Apps)
# are baked into the production bundle, then serve in production mode.
CMD ["sh", "-c", "npm run build && npm run start"]

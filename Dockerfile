# Backend Dockerfile for Coolify
# Builds a lean Node.js image and exposes a unique port to avoid clashes

FROM node:20-alpine

ENV NODE_ENV=production \
    PORT=3087

WORKDIR /app

# System deps for healthcheck
RUN apk add --no-cache curl

# Install dependencies first for better layer caching
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copy application code
COPY . .

# Ensure runtime directories exist and are writable
RUN mkdir -p /app/uploads && \
    chown -R node:node /app

USER node

EXPOSE 3087

# Healthcheck hitting Express /health
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS http://127.0.0.1:${PORT}/health || exit 1

CMD ["node", "server.js"]

# Code Worker - Isolated Environment for Code Operations
FROM node:20-alpine

# Security: Non-root user
RUN addgroup -g 1001 -S coderunner && \
    adduser -S coderunner -u 1001 -G coderunner

# Install ONLY necessary tools
RUN apk add --no-cache \
    git \
    openssh-client \
    dumb-init \
    python3 \
    make \
    g++

# Create sandboxed workspace
RUN mkdir -p /workspace/repos /workspace/tmp /workspace/artifacts && \
    chown -R coderunner:coderunner /workspace

# Create app directory
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY --chown=coderunner:coderunner dist/ ./dist/

# Switch to non-root user
USER coderunner

# Set workspace as home
ENV HOME=/workspace
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

EXPOSE 3001

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]

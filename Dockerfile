# Multi-stage build for Nubabel Platform
# Production-optimized with security hardening and health checks

# ============================================================================
# Stage 1: Backend Builder
# ============================================================================
FROM node:20-alpine AS backend-builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache \
    openssl \
    openssl-dev \
    python3 \
    make \
    g++

# Copy package files for dependency installation
COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma/

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Generate Prisma Client
RUN npx prisma generate

# Copy source code
COPY src ./src

# Build TypeScript (suppress non-critical warnings)
RUN npm run build

# ============================================================================
# Stage 1.5: Frontend Builder
# ============================================================================
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
# Ensure .env.production is used
COPY frontend/.env.production .
RUN npm run build

# ============================================================================
# Stage 2: Production Runtime
# ============================================================================
FROM node:20-alpine AS runtime

# Install runtime dependencies and security tools
RUN apk add --no-cache \
    dumb-init \
    openssl \
    openssl-dev \
    curl \
    ca-certificates

# Create non-root app user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install ONLY production dependencies
RUN npm ci --omit=dev && \
    npm cache clean --force

# Generate Prisma Client in runtime stage
RUN npx prisma generate

# Copy built application from backend-builder
COPY --from=backend-builder /app/dist ./dist

# Copy built frontend from frontend-builder
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Copy landing page
COPY landing ./landing

# Copy startup and utility scripts
COPY scripts/start.sh ./scripts/start.sh
COPY scripts/fix-migration.js ./scripts/fix-migration.js
COPY scripts/seed-workflows.js ./scripts/seed-workflows.js

# Make scripts executable
RUN chmod +x ./scripts/start.sh

# Create logs directory
RUN mkdir -p /app/logs

# Set ownership to app user
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose application port
EXPOSE 3000

# Health check using Node.js built-in HTTP
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health/ready', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)}).on('error', () => process.exit(1))"

# Use dumb-init to properly handle signals (SIGTERM for graceful shutdown)
ENTRYPOINT ["dumb-init", "--"]

# Start application (runs migrations, then starts server)
CMD ["./scripts/start.sh"]

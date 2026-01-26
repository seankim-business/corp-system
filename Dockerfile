# Multi-stage build for Kyndof Corp System

# ============================================================================
# Stage 1: Builder
# ============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install openssl and openssl-dev for Prisma
RUN apk add --no-cache openssl openssl-dev

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci

# Generate Prisma Client
RUN npx prisma generate

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# ============================================================================
# Stage 2: Production Runtime
# ============================================================================
FROM node:20-alpine AS runtime

# Install dumb-init, openssl and openssl-dev for Prisma
RUN apk add --no-cache dumb-init openssl openssl-dev

# Create app user (non-root)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy Prisma files for migrations
COPY prisma ./prisma/

# Install production dependencies only
RUN npm ci --only=production && \
    npm cache clean --force

# Generate Prisma Client in runtime stage
RUN npx prisma generate

# Copy built application from builder
COPY --from=builder /app/dist ./dist

COPY frontend/dist ./frontend/dist

# Copy startup script and make executable
COPY scripts/start.sh ./scripts/start.sh
RUN chmod +x ./scripts/start.sh

# Set ownership to app user
RUN chown -R nodejs:nodejs /app

# Switch to app user
USER nodejs

# Expose port
EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start application - using minimal test server for debugging
CMD ["sh", "-c", "echo '=== Starting Nubabel Container (MINIMAL TEST MODE) ===' && echo 'Environment: '${NODE_ENV} && echo 'Database URL: '${DATABASE_URL:0:30}'...' && echo '' && echo '=== Starting Minimal Test Server ===' && node dist/minimal-test.js"]

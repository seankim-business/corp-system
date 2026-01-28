# Multi-stage build for Kyndof Corp System
# Note: Frontend is pre-built and committed to git to reduce build memory usage

# ============================================================================
# Stage 1: Backend Builder
# ============================================================================
FROM node:20-alpine AS backend-builder

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

# Copy built application from backend-builder
COPY --from=backend-builder /app/dist ./dist

# Copy pre-built frontend (committed to git)
COPY frontend/dist ./frontend/dist

# Copy landing page
COPY landing ./landing

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

# Start application (runs migrations first, non-fatal)
# Using db push to sync schema (fixes table mismatch issues)
CMD ["sh", "-c", "echo '=== Starting Nubabel Container v2 ===' && echo 'Environment: '${NODE_ENV} && echo 'Database URL: '${DATABASE_URL:0:30}'...' && echo '' && echo '=== Syncing Database Schema ===' && (npx prisma db push --accept-data-loss --schema=prisma/schema.prisma && echo '✅ Schema synced successfully' || echo '⚠️  Schema sync failed, trying migrate deploy...') && (npx prisma migrate deploy --schema=prisma/schema.prisma || echo '⚠️  Migration failed, starting server anyway') && echo '' && echo '=== Starting Node.js Server ===' && node dist/index.js"]

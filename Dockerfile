# Multi-stage build for Kyndof Corp System

# ============================================================================
# Stage 1: Builder
# ============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

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

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app user (non-root)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && \
    npm cache clean --force

# Copy Prisma files for migrations
COPY prisma ./prisma/

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Copy node_modules with Prisma Client from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Set ownership to app user
RUN chown -R nodejs:nodejs /app

# Switch to app user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "dist/index.js"]

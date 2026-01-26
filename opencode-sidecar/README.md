# OpenCode Sidecar Service

HTTP bridge service that replicates Nubabel's built-in AI executor behavior, enabling external AI orchestration without code changes to the main application.

## Architecture

```
┌─────────────────┐         HTTP          ┌──────────────────────┐
│  Nubabel API    │◄─────────────────────►│  OpenCode Sidecar    │
│  (Express.js)   │   POST /delegate      │  (Express.js)        │
│                 │   GET  /health        │  + Anthropic SDK     │
└─────────────────┘                       └──────────────────────┘
```

## Features

- ✅ Exact interface match with Nubabel's `delegate-task.ts`
- ✅ Category-based model selection (Haiku/Sonnet)
- ✅ Skill-based system prompt injection
- ✅ Request validation with detailed error messages
- ✅ 30-second timeout enforcement
- ✅ Cost tracking (token counting)
- ✅ Health check endpoint
- ✅ Graceful shutdown
- ✅ Docker support

## Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

# Run in development mode (with hot reload)
npm run dev

# Test health check
curl http://localhost:3001/health
```

### Production Build

```bash
# Build TypeScript
npm run build

# Start production server
npm start
```

### Docker

```bash
# Build image
docker build -t opencode-sidecar .

# Run container
docker run -p 3001:3001 \
  -e ANTHROPIC_API_KEY=your-key-here \
  opencode-sidecar

# Or use docker-compose
docker-compose up -d
```

## API Reference

### POST /delegate

Delegate a task to the AI orchestration system.

**Request**:

```json
{
  "category": "ultrabrain",
  "load_skills": ["git-master"],
  "prompt": "Explain Git rebase vs merge",
  "session_id": "ses_1738000000_abc123",
  "organizationId": "org_123",
  "userId": "user_456",
  "context": {
    "availableMCPs": []
  }
}
```

**Response (200 OK)**:

```json
{
  "output": "Git rebase and merge are two different ways...",
  "status": "success",
  "metadata": {
    "model": "claude-3-5-sonnet-20241022",
    "duration": 3456,
    "inputTokens": 1234,
    "outputTokens": 567,
    "cost": 0.0089
  }
}
```

**Error (400 Bad Request)**:

```json
{
  "output": "Validation error: category: Invalid category...",
  "status": "failed",
  "metadata": {
    "model": "unknown",
    "duration": 0,
    "error": "VALIDATION_ERROR"
  }
}
```

### GET /health

Health check endpoint.

**Response (200 OK)**:

```json
{
  "status": "healthy",
  "timestamp": "2026-01-26T14:00:00Z",
  "uptime": 7200,
  "anthropic": {
    "configured": true
  }
}
```

## Configuration

### Environment Variables

| Variable            | Required | Default     | Description                            |
| ------------------- | -------- | ----------- | -------------------------------------- |
| `PORT`              | No       | 3001        | Server port                            |
| `NODE_ENV`          | No       | development | Environment (development/production)   |
| `ANTHROPIC_API_KEY` | Yes      | -           | Anthropic API key                      |
| `LOG_LEVEL`         | No       | info        | Log level (debug/info/warn/error)      |
| `ALLOWED_ORIGINS`   | No       | \*          | CORS allowed origins (comma-separated) |

### Categories & Models

| Category             | Model                      | Use Case                            |
| -------------------- | -------------------------- | ----------------------------------- |
| `quick`              | claude-3-5-haiku-20241022  | Simple tasks, typo fixes            |
| `writing`            | claude-3-5-haiku-20241022  | Documentation, technical writing    |
| `unspecified-low`    | claude-3-5-haiku-20241022  | Unclear tasks, low effort           |
| `artistry`           | claude-3-5-sonnet-20241022 | Creative content, branding          |
| `visual-engineering` | claude-3-5-sonnet-20241022 | UI/UX, frontend development         |
| `unspecified-high`   | claude-3-5-sonnet-20241022 | Unclear tasks, high effort          |
| `ultrabrain`         | claude-3-5-sonnet-20241022 | Complex architecture, deep analysis |

### Skills

| Skill             | Description                                           |
| ----------------- | ----------------------------------------------------- |
| `mcp-integration` | Multi-tool integration (Notion, Linear, GitHub, etc.) |
| `playwright`      | Browser automation, web scraping                      |
| `git-master`      | Git operations, version control                       |
| `frontend-ui-ux`  | Frontend development, design                          |

## Integration with Nubabel

### Step 1: Start Sidecar Service

```bash
# Local development
cd opencode-sidecar
npm run dev

# Or with Docker
docker-compose up -d
```

### Step 2: Configure Nubabel

```bash
# In Nubabel's .env
OPENCODE_SIDECAR_URL=http://localhost:3001
OPENCODE_SIDECAR_TIMEOUT=120000
```

### Step 3: Verify Integration

```bash
# Check sidecar health
curl http://localhost:3001/health

# Restart Nubabel
cd /path/to/nubabel
npm run dev

# Test delegation via Nubabel (sends to sidecar automatically)
# Use Slack bot or workflow execution
```

### Step 4: Monitor Logs

```bash
# Sidecar logs
docker-compose logs -f opencode-sidecar

# Nubabel logs
npm run dev
# Look for: "Delegating task to OpenCode sidecar"
```

## Deployment

### Railway (Recommended)

1. Create new Railway service
2. Connect GitHub repository
3. Set root directory: `opencode-sidecar`
4. Add environment variables:
   - `ANTHROPIC_API_KEY`
   - `PORT=3001`
   - `NODE_ENV=production`
5. Deploy

Railway will automatically:

- Detect Dockerfile
- Build image
- Expose port 3001
- Run health checks

### Docker Compose (Local/Server)

```bash
# With Nubabel network
docker-compose up -d

# Standalone
docker-compose -f docker-compose.standalone.yml up -d
```

### Manual Deployment

```bash
# Build
npm run build

# Deploy dist/ and node_modules/ to server

# Run with PM2
pm2 start dist/index.js --name opencode-sidecar

# Or systemd service
sudo systemctl start opencode-sidecar
```

## Monitoring

### Health Check

```bash
# Local
curl http://localhost:3001/health

# Production
curl https://sidecar.nubabel.com/health
```

### Logs

```bash
# Docker
docker logs opencode-sidecar -f

# PM2
pm2 logs opencode-sidecar

# Systemd
journalctl -u opencode-sidecar -f
```

### Metrics

Monitor these via your observability platform:

- Request rate (requests/minute)
- Error rate (%)
- P95 latency (ms)
- Token usage (input/output tokens)
- Cost per request (USD)

## Troubleshooting

### Sidecar Not Responding

```bash
# Check if running
docker ps | grep opencode-sidecar

# Check logs
docker logs opencode-sidecar

# Restart
docker-compose restart opencode-sidecar
```

### 401 Authentication Error

```bash
# Verify API key is set
docker exec opencode-sidecar env | grep ANTHROPIC_API_KEY

# Test API key directly
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01"
```

### Timeout Errors

```bash
# Check timeout settings
# Nubabel: OPENCODE_SIDECAR_TIMEOUT=120000
# Sidecar: 30s max (hardcoded in constants.ts)

# Increase if needed (not recommended)
# Edit src/constants.ts: DEFAULT_REQUEST_TIMEOUT
```

### Validation Errors

```bash
# Test with curl
curl -X POST http://localhost:3001/delegate \
  -H "Content-Type: application/json" \
  -d '{
    "category": "quick",
    "load_skills": [],
    "prompt": "Hello",
    "session_id": "ses_1738000000_test"
  }'

# Check error message for specific field
```

## Development

### Project Structure

```
opencode-sidecar/
├── src/
│   ├── index.ts          # Express server
│   ├── delegate.ts       # Anthropic SDK wrapper
│   ├── validator.ts      # Request validation
│   ├── types.ts          # TypeScript types
│   └── constants.ts      # Configuration
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
└── README.md
```

### Adding New Categories

```typescript
// src/constants.ts
export const CATEGORY_MODEL_MAP: Record<Category, string> = {
  ...
  "new-category": "claude-3-5-sonnet-20241022",
};

// src/types.ts
export type Category =
  | ...
  | "new-category";
```

### Adding New Skills

```typescript
// src/constants.ts
export const SKILL_SYSTEM_PROMPTS: Record<string, string> = {
  ...
  "new-skill": "You are an expert in ...",
};

// src/types.ts
export type Skill = ... | "new-skill";
```

## Testing

```bash
# Type check
npm run type-check

# Lint
npm run lint

# Manual test
npm run dev
curl -X POST http://localhost:3001/delegate \
  -H "Content-Type: application/json" \
  -d @test-request.json
```

## Security

- API key stored in environment variables (never committed)
- Non-root user in Docker (expressjs:nodejs)
- Request validation prevents malicious input
- Rate limiting (100 req/15min)
- Helmet.js security headers
- CORS configuration

## Performance

- **P50 latency**: ~3-5 seconds
- **P95 latency**: ~10-15 seconds
- **Timeout**: 30 seconds (hard limit)
- **Throughput**: 60+ requests/minute
- **Memory**: 256-512 MB
- **CPU**: 0.5-1 vCPU

## License

Proprietary - © 2026 Kyndof Corporation

## Support

- **Email**: engineering@nubabel.com
- **Docs**: /opencode-sidecar/API_SPEC.md
- **Issues**: Report via internal issue tracker

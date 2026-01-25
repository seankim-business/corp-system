# Nubabel Implementation Tasks - Comprehensive Extraction

**Source**: research/architecture/01-synthesis-and-decisions.md  
**Date**: 2026-01-26  
**Scope**: All implementation tasks, features, optimizations, and security enhancements

---

## 📋 Table of Contents

1. [Infrastructure & Setup](#infrastructure--setup)
2. [Job Queue & Background Tasks](#job-queue--background-tasks)
3. [Slack Bot Integration](#slack-bot-integration)
4. [Orchestrator & Routing](#orchestrator--routing)
5. [MCP Integration](#mcp-integration)
6. [Session Management](#session-management)
7. [Real-Time Updates](#real-time-updates)
8. [Error Handling & Resilience](#error-handling--resilience)
9. [Testing & Monitoring](#testing--monitoring)
10. [Security & Multi-Tenancy](#security--multi-tenancy)
11. [Performance Optimization](#performance-optimization)
12. [Deployment & DevOps](#deployment--devops)

---

## Infrastructure & Setup

### Core Dependencies Installation

- [ ] Install BullMQ 5.x (`npm install bullmq`)
- [ ] Install Redis client (`npm install ioredis`)
- [ ] Install MCP SDK (`npm install @modelcontextprotocol/sdk zod`)
- [ ] Install MCP split packages:
  - [ ] `@modelcontextprotocol/server`
  - [ ] `@modelcontextprotocol/client`
  - [ ] `@modelcontextprotocol/node`
  - [ ] `@modelcontextprotocol/express`
- [ ] Verify Node.js 20+ runtime
- [ ] Verify TypeScript 5.3+ configuration
- [ ] Verify Express.js 4.18+ setup

### Directory Structure

- [ ] Create `src/queue/` directory
  - [ ] `queue.ts` - Queue initialization
  - [ ] `workers.ts` - Worker setup
  - [ ] `jobs.ts` - Job definitions
- [ ] Create `src/mcp-servers/slack/` (mirror Notion pattern)
- [ ] Create `src/services/mcp-registry.ts` (MCP connection management)
- [ ] Verify `src/orchestrator/` directory exists with all modules

### Configuration & Environment

- [ ] Add BullMQ Redis connection config to environment
- [ ] Add MCP server configuration
- [ ] Add Slack bot configuration (already done)
- [ ] Add job queue monitoring configuration
- [ ] Document all new environment variables

---

## Job Queue & Background Tasks

### BullMQ Queue Setup

- [ ] Initialize BullMQ Queue with Redis connection
  - [ ] Host: localhost (dev) / Redis URL (prod)
  - [ ] Port: 6379
  - [ ] Connection pooling configuration
- [ ] Configure default job options:
  - [ ] Attempts: 3
  - [ ] Backoff type: exponential
  - [ ] Backoff delay: 2000ms
  - [ ] Backoff jitter: 0.5 (50%)
  - [ ] Remove on complete: 1000 (keep 1000 completed jobs)
  - [ ] Remove on fail: 5000 (keep 5000 failed jobs)
- [ ] Create queue instance for "ai-agent-tasks"
- [ ] Create queue instance for other task types (if needed)

### Worker Implementation

- [ ] Implement background worker for "ai-agent-tasks"
  - [ ] Process job data (userId, channelId, threadTs, message)
  - [ ] Execute agent orchestration
  - [ ] Send results to Slack thread
  - [ ] Handle job completion
- [ ] Configure worker concurrency: 5 (adjustable)
- [ ] Implement worker error handling
- [ ] Implement worker logging
- [ ] Add worker health checks

### Job Definitions

- [ ] Define job schema for "process-mention"
  - [ ] userId: string
  - [ ] channelId: string
  - [ ] threadTs: string
  - [ ] message: string
- [ ] Define job schema for other task types
- [ ] Create TypeScript interfaces for job data
- [ ] Document job lifecycle (pending → active → completed/failed)

### Job Lifecycle Management

- [ ] Implement job enqueueing (< 10ms target)
- [ ] Implement job progress tracking
- [ ] Implement job completion handling
- [ ] Implement job failure handling
- [ ] Implement job retry logic
- [ ] Implement dead letter queue (DLQ) for failed jobs
- [ ] Implement job prioritization (if needed)
- [ ] Implement job rate limiting (if needed)

---

## Slack Bot Integration

### Slack Event Handlers

- [ ] Implement `app_mention` event handler
  - [ ] Extract event data (user, channel, thread_ts, text)
  - [ ] Acknowledge immediately (< 100ms)
  - [ ] Send "Processing..." message to thread
  - [ ] Queue job in BullMQ
- [ ] Implement user authentication
  - [ ] Map Slack user ID to Nubabel user
  - [ ] Verify user exists in database
  - [ ] Handle unknown users (create or reject)
- [ ] Implement organization mapping
  - [ ] Map Slack workspace to Nubabel organization
  - [ ] Verify organization exists
  - [ ] Handle unknown organizations
- [ ] Implement message parsing
  - [ ] Extract command/intent from message
  - [ ] Extract parameters/context
  - [ ] Handle malformed messages

### Slack Message Handling

- [ ] Implement "Processing..." message
  - [ ] Send to thread immediately
  - [ ] Include job ID for tracking
  - [ ] Include estimated time
- [ ] Implement result notification
  - [ ] Send to same thread
  - [ ] Include success/failure status
  - [ ] Include result summary
  - [ ] Include error details (if failed)
- [ ] Implement progress updates (optional)
  - [ ] Update "Processing..." message with progress
  - [ ] Use message threading
  - [ ] Include percentage/status

### Slack Authentication & Authorization

- [ ] Verify Slack signing secret
- [ ] Validate request signatures
- [ ] Extract user context from Slack
- [ ] Verify user permissions
- [ ] Handle permission denied scenarios
- [ ] Implement rate limiting per user

### Slack Socket Mode

- [ ] Verify Socket Mode connection
- [ ] Implement connection retry logic
- [ ] Implement connection health checks
- [ ] Log connection status
- [ ] Handle disconnection gracefully

---

## Orchestrator & Routing

### Custom Router Implementation

- [ ] Implement fast path (keyword matching)
  - [ ] Keywords for "notion": "notion", "task", "create task", etc.
  - [ ] Keywords for "analysis": "analyze", "summary", "summarize", etc.
  - [ ] Keywords for "calendar": "schedule", "meeting", "event", etc.
  - [ ] Keywords for other agents (as needed)
  - [ ] Case-insensitive matching
  - [ ] Partial word matching (optional)
  - [ ] Performance target: < 1ms
- [ ] Implement slow path (LLM-based routing)
  - [ ] Use Claude 3.5 Sonnet
  - [ ] System prompt: "You are a task router..."
  - [ ] Tool: `route_to_agent` with agent enum
  - [ ] Extract agent from tool use response
  - [ ] Extract confidence score
  - [ ] Performance target: < 500ms
- [ ] Implement hybrid router
  - [ ] Try fast path first
  - [ ] Fall back to slow path if no match
  - [ ] Cache routing decisions (optional)
  - [ ] Log routing decisions for analysis

### Router Configuration

- [ ] Define available agents
  - [ ] notion: Create/update tasks in Notion
  - [ ] analysis: Analyze documents and summarize
  - [ ] calendar: Schedule meetings and events
  - [ ] (Add more as needed)
- [ ] Define agent descriptions
- [ ] Define agent capabilities
- [ ] Document agent selection criteria

### Routing Fallback & Error Handling

- [ ] Implement default agent (if routing fails)
- [ ] Implement "general" agent for ambiguous requests
- [ ] Implement routing error logging
- [ ] Implement routing confidence threshold
- [ ] Implement manual routing override (admin feature)

### Session Integration

- [ ] Load session from Redis/PostgreSQL
- [ ] Pass session context to router
- [ ] Update session with routing decision
- [ ] Preserve session state across routing

---

## MCP Integration

### MCP Server Setup

- [ ] Install official MCP SDK v1.x
- [ ] Choose transport: `StreamableHTTPServerTransport`
- [ ] Create MCP server instance
- [ ] Configure MCP server port/endpoint
- [ ] Implement MCP server initialization

### Multi-Tenant MCP Session Management

- [ ] Implement session ID generation
  - [ ] Format: `mcp-session-{uuid}`
  - [ ] Store in request headers
  - [ ] Persist in Redis
- [ ] Implement session metadata storage
  - [ ] userId
  - [ ] organizationId
  - [ ] TTL: 3600 seconds (1 hour)
- [ ] Implement session retrieval
  - [ ] Get or create transport per session
  - [ ] Reuse transport for same session
  - [ ] Clean up expired sessions
- [ ] Implement session isolation
  - [ ] Verify user access to organization
  - [ ] Verify organization access to MCP connections

### MCP Tool Aggregation

- [ ] Implement `ListToolsRequestSchema` handler
  - [ ] Aggregate tools from all enabled MCP servers
  - [ ] Namespace tools by provider: `{provider}__{toolName}`
  - [ ] Return tool list with descriptions
  - [ ] Include tool input schemas
- [ ] Implement `CallToolRequestSchema` handler
  - [ ] Parse tool name: extract provider and toolName
  - [ ] Route to appropriate MCP server
  - [ ] Execute tool with arguments
  - [ ] Return tool result
  - [ ] Handle tool errors

### MCP Authentication Patterns

- [ ] Implement API Key authentication
  - [ ] Store API keys in database (encrypted)
  - [ ] Pass API keys to MCP servers
  - [ ] Rotate API keys (optional)
- [ ] Implement OAuth 2.0 authentication
  - [ ] Support Slack OAuth
  - [ ] Support Notion OAuth
  - [ ] Support Google OAuth
  - [ ] Implement refresh token management
  - [ ] Handle token expiration
- [ ] Implement JWT authentication
  - [ ] Generate JWT for multi-tenant identity
  - [ ] Pass JWT to MCP servers
  - [ ] Verify JWT signature

### MCP Server Implementations

- [ ] Extend Notion MCP server
  - [ ] Verify existing tools: getTasks, createTask, updateTask, deleteTask
  - [ ] Add new tools as needed
  - [ ] Test all tools
- [ ] Create Slack MCP server
  - [ ] Implement postMessage tool
  - [ ] Implement getChannels tool
  - [ ] Implement getUsers tool
  - [ ] Implement other Slack operations
- [ ] Create Linear MCP server (placeholder)
  - [ ] Implement createIssue tool
  - [ ] Implement updateIssue tool
  - [ ] Implement getIssues tool
- [ ] Create Jira MCP server (placeholder)
  - [ ] Implement createIssue tool
  - [ ] Implement updateIssue tool
  - [ ] Implement getIssues tool
- [ ] Create other MCP servers as needed

### MCP Connection Management

- [ ] Implement `MCPRegistry` service
  - [ ] `getActiveMCPConnections(organizationId)`
  - [ ] `createMCPConnection(provider, config)`
  - [ ] `updateMCPConnection(connectionId, config)`
  - [ ] `deleteMCPConnection(connectionId)`
  - [ ] `testMCPConnection(connectionId)`
- [ ] Implement MCP connection validation
  - [ ] Verify credentials
  - [ ] Test API connectivity
  - [ ] Check rate limits
  - [ ] Verify permissions
- [ ] Implement MCP connection caching
  - [ ] Cache active connections in Redis
  - [ ] Invalidate cache on update
  - [ ] TTL: 1 hour
- [ ] Implement MCP connection monitoring
  - [ ] Track connection health
  - [ ] Log connection errors
  - [ ] Alert on connection failures

---

## Session Management

### Session Storage (2-Tier Pattern)

- [ ] Implement Redis hot storage
  - [ ] Key format: `session:{sessionId}`
  - [ ] TTL: 1 hour
  - [ ] Store: userId, organizationId, state, history, metadata
  - [ ] Fast reads/writes (< 10ms)
- [ ] Implement PostgreSQL cold storage
  - [ ] Use existing `Session` table
  - [ ] Persist all session data
  - [ ] Maintain historical records
  - [ ] Enable session recovery
- [ ] Implement session synchronization
  - [ ] Write to Redis first (fast)
  - [ ] Async write to PostgreSQL (durable)
  - [ ] Handle Redis failures (fallback to PostgreSQL)
  - [ ] Rebuild Redis from PostgreSQL on startup

### Session Continuity

- [ ] Implement Slack thread tracking
  - [ ] Store `slackThreadTs` in session metadata
  - [ ] Use thread ID to restore session
  - [ ] Preserve conversation history in thread
- [ ] Implement cross-interface continuity
  - [ ] Same session ID across Slack/Web/Terminal
  - [ ] Update source field when switching interfaces
  - [ ] Preserve conversation history
  - [ ] Maintain state across interfaces
- [ ] Implement session restoration
  - [ ] Load session by ID
  - [ ] Verify user access
  - [ ] Restore conversation history
  - [ ] Continue from last state

### Session State Management

- [ ] Implement state object
  - [ ] Current agent
  - [ ] Current task
  - [ ] Workflow context
  - [ ] User preferences
- [ ] Implement history tracking
  - [ ] Store all messages (user + assistant)
  - [ ] Include timestamps
  - [ ] Include metadata (agent, tool, result)
  - [ ] Limit history size (e.g., last 100 messages)
- [ ] Implement metadata storage
  - [ ] Source: slack/web/terminal/api
  - [ ] slackThreadTs (if from Slack)
  - [ ] slackChannelId (if from Slack)
  - [ ] Custom metadata per source

### OhMyOpenCode Integration

- [ ] Implement `delegate_task` calls
  - [ ] Pass session_id to delegate_task
  - [ ] Pass user message as prompt
  - [ ] Pass category (quick/medium/complex)
  - [ ] Pass load_skills array
- [ ] Implement session ID propagation
  - [ ] Extract session ID from request
  - [ ] Pass to delegate_task
  - [ ] Agent remembers context automatically
- [ ] Implement context passing
  - [ ] Pass conversation history
  - [ ] Pass session state
  - [ ] Pass user/organization context
  - [ ] Pass MCP connections

---

## Real-Time Updates

### Server-Sent Events (SSE) Implementation

- [ ] Create SSE endpoint: `/api/jobs/:jobId/progress`
  - [ ] Accept GET requests
  - [ ] Set Content-Type: text/event-stream
  - [ ] Set Cache-Control: no-cache
  - [ ] Keep connection open
- [ ] Implement SSE event streaming
  - [ ] Send progress events
  - [ ] Send completion events
  - [ ] Send error events
  - [ ] Send status updates
- [ ] Implement SSE client-side
  - [ ] Use native EventSource API
  - [ ] Handle connection open
  - [ ] Handle incoming events
  - [ ] Handle connection close
  - [ ] Implement reconnection logic

### BullMQ Event Integration

- [ ] Connect BullMQ `progress` event to SSE
  - [ ] Listen to job progress events
  - [ ] Send progress to connected clients
  - [ ] Include progress percentage
  - [ ] Include progress message
- [ ] Connect BullMQ `completed` event to SSE
  - [ ] Listen to job completion
  - [ ] Send completion event to clients
  - [ ] Include final result
  - [ ] Close SSE connection
- [ ] Connect BullMQ `failed` event to SSE
  - [ ] Listen to job failure
  - [ ] Send error event to clients
  - [ ] Include error message
  - [ ] Include error details
  - [ ] Close SSE connection

### Frontend Integration

- [ ] Create `useJobProgress` React hook
  - [ ] Accept jobId as parameter
  - [ ] Connect to SSE endpoint
  - [ ] Return progress state
  - [ ] Return completion state
  - [ ] Return error state
  - [ ] Handle cleanup on unmount
- [ ] Create progress bar component
  - [ ] Display progress percentage
  - [ ] Display progress message
  - [ ] Display status (processing/completed/failed)
  - [ ] Update in real-time
- [ ] Implement fallback polling
  - [ ] Poll every 2 seconds if SSE unavailable
  - [ ] GET `/api/jobs/:jobId/status`
  - [ ] Update UI with status
  - [ ] Stop polling on completion

### Monitoring & Logging

- [ ] Log SSE connections
- [ ] Log SSE disconnections
- [ ] Log SSE errors
- [ ] Track SSE connection duration
- [ ] Monitor SSE performance

---

## Error Handling & Resilience

### Exponential Backoff with Jitter

- [ ] Implement retry function
  - [ ] Max attempts: 3
  - [ ] Base delay: 1000ms
  - [ ] Exponential multiplier: 2
  - [ ] Max delay: 10000ms
  - [ ] Jitter: 0-10% variance
- [ ] Implement custom backoff strategy
  - [ ] Rate limit errors: 60000ms (1 minute)
  - [ ] Auth errors: -1 (stop retry)
  - [ ] Other errors: exponential backoff
- [ ] Apply to BullMQ jobs
  - [ ] Configure in queue options
  - [ ] Test retry behavior
  - [ ] Monitor retry metrics

### Circuit Breaker Pattern

- [ ] Implement CircuitBreaker class
  - [ ] States: closed, open, half-open
  - [ ] Failure threshold: configurable
  - [ ] Success threshold: configurable
  - [ ] Timeout: configurable
- [ ] Implement circuit breaker for external APIs
  - [ ] Notion API
  - [ ] Slack API
  - [ ] Linear API
  - [ ] Jira API
  - [ ] Other external services
- [ ] Implement circuit breaker monitoring
  - [ ] Log state transitions
  - [ ] Alert on open circuit
  - [ ] Track failure rates
  - [ ] Monitor recovery

### Error Recovery Strategies

- [ ] Implement graceful degradation
  - [ ] Disable failing MCP server
  - [ ] Continue with available tools
  - [ ] Notify user of limitations
- [ ] Implement fallback mechanisms
  - [ ] If Redis fails: use PostgreSQL
  - [ ] If MCP server fails: use cached data
  - [ ] If LLM fails: use keyword routing
- [ ] Implement error logging
  - [ ] Log all errors with context
  - [ ] Include stack traces
  - [ ] Include request/response data
  - [ ] Include user/organization context

### Dead Letter Queue (DLQ)

- [ ] Implement DLQ for failed jobs
  - [ ] Move jobs after max retries
  - [ ] Store in separate queue
  - [ ] Include failure reason
  - [ ] Include retry history
- [ ] Implement DLQ monitoring
  - [ ] Alert on DLQ jobs
  - [ ] Manual retry capability
  - [ ] DLQ cleanup (archive old jobs)
- [ ] Implement DLQ analysis
  - [ ] Track failure patterns
  - [ ] Identify systemic issues
  - [ ] Generate failure reports

---

## Testing & Monitoring

### Bull Board UI Setup

- [ ] Install Bull Board
- [ ] Create `/admin/queues` endpoint
- [ ] Configure Bull Board authentication
  - [ ] Require admin role
  - [ ] Verify organization access
- [ ] Expose queue monitoring
  - [ ] View queue status
  - [ ] View job details
  - [ ] View job history
  - [ ] Retry failed jobs
  - [ ] Delete jobs

### Metrics Collection

- [ ] Implement job count metrics
  - [ ] Waiting jobs
  - [ ] Active jobs
  - [ ] Completed jobs
  - [ ] Failed jobs
  - [ ] Delayed jobs
- [ ] Implement duration tracking
  - [ ] Job enqueue time
  - [ ] Job processing time
  - [ ] Job total time
  - [ ] P50/P95/P99 latencies
- [ ] Implement error rate tracking
  - [ ] Errors per job type
  - [ ] Errors per agent
  - [ ] Errors per MCP server
  - [ ] Error trends over time
- [ ] Implement performance metrics
  - [ ] Queue throughput (jobs/sec)
  - [ ] Worker utilization
  - [ ] Redis memory usage
  - [ ] PostgreSQL query performance

### E2E Testing

- [ ] Test Slack → Notion task creation
  - [ ] Send @mention in Slack
  - [ ] Verify job queued
  - [ ] Verify task created in Notion
  - [ ] Verify result posted to Slack
- [ ] Test Web → Slack notification
  - [ ] Create workflow in web UI
  - [ ] Execute workflow
  - [ ] Verify notification sent to Slack
  - [ ] Verify message format
- [ ] Test session continuity
  - [ ] Start conversation in Slack
  - [ ] Switch to web UI
  - [ ] Verify history preserved
  - [ ] Verify state maintained
  - [ ] Switch back to Slack
  - [ ] Verify continuity

### Unit Testing

- [ ] Test router (fast path)
  - [ ] Test keyword matching
  - [ ] Test case insensitivity
  - [ ] Test performance (< 1ms)
- [ ] Test router (slow path)
  - [ ] Test LLM routing
  - [ ] Test confidence scoring
  - [ ] Test fallback behavior
- [ ] Test session manager
  - [ ] Test session creation
  - [ ] Test session retrieval
  - [ ] Test session update
  - [ ] Test session expiration
- [ ] Test MCP registry
  - [ ] Test connection creation
  - [ ] Test connection retrieval
  - [ ] Test connection validation
  - [ ] Test tool aggregation

### Integration Testing

- [ ] Test BullMQ integration
  - [ ] Test job enqueueing
  - [ ] Test worker processing
  - [ ] Test job completion
  - [ ] Test job failure
  - [ ] Test retry logic
- [ ] Test Slack integration
  - [ ] Test event handling
  - [ ] Test message posting
  - [ ] Test thread management
- [ ] Test MCP integration
  - [ ] Test tool execution
  - [ ] Test error handling
  - [ ] Test authentication

---

## Security & Multi-Tenancy

### Multi-Tenant Isolation

- [ ] Implement organization-based filtering
  - [ ] All queries filtered by organizationId
  - [ ] Row-Level Security (RLS) in PostgreSQL
  - [ ] Redis key namespacing by organization
- [ ] Implement session isolation
  - [ ] Verify user belongs to organization
  - [ ] Verify organization owns session
  - [ ] Prevent cross-organization access
- [ ] Implement MCP connection isolation
  - [ ] Verify organization owns connection
  - [ ] Prevent cross-organization tool access
  - [ ] Isolate credentials per organization

### Authentication & Authorization

- [ ] Verify JWT tokens
  - [ ] Check signature
  - [ ] Check expiration
  - [ ] Check organization claim
- [ ] Implement role-based access control (RBAC)
  - [ ] Admin: full access
  - [ ] User: limited access
  - [ ] Guest: read-only access
- [ ] Implement permission checks
  - [ ] Verify user can create workflows
  - [ ] Verify user can execute workflows
  - [ ] Verify user can manage MCP connections
  - [ ] Verify user can view logs

### Credential Management

- [ ] Implement encrypted credential storage
  - [ ] Encrypt API keys in database
  - [ ] Use environment variables for master key
  - [ ] Rotate encryption keys (optional)
- [ ] Implement credential rotation
  - [ ] Support API key rotation
  - [ ] Support OAuth token refresh
  - [ ] Notify users of expiration
- [ ] Implement credential audit logging
  - [ ] Log credential access
  - [ ] Log credential changes
  - [ ] Alert on suspicious activity

### API Security

- [ ] Implement rate limiting
  - [ ] Per user: 100 requests/minute
  - [ ] Per organization: 1000 requests/minute
  - [ ] Per IP: 10000 requests/minute
- [ ] Implement request validation
  - [ ] Validate request schema
  - [ ] Validate input types
  - [ ] Sanitize user input
- [ ] Implement CORS protection
  - [ ] Allow only trusted origins
  - [ ] Verify origin header
  - [ ] Implement CSRF tokens

### Slack Security

- [ ] Verify Slack signing secret
  - [ ] Check X-Slack-Request-Timestamp
  - [ ] Check X-Slack-Signature
  - [ ] Reject old requests (> 5 minutes)
- [ ] Implement Slack user verification
  - [ ] Verify user exists in Nubabel
  - [ ] Verify user has access to organization
  - [ ] Verify user has required permissions

---

## Performance Optimization

### Router Optimization

- [ ] Implement keyword matching cache
  - [ ] Cache keyword patterns
  - [ ] Reuse compiled regexes
  - [ ] Target: < 1ms per request
- [ ] Implement LLM routing optimization
  - [ ] Cache routing decisions
  - [ ] Reuse similar requests
  - [ ] Target: < 500ms per request
- [ ] Implement hybrid router optimization
  - [ ] 90%+ requests use fast path
  - [ ] Only 10% use slow path
  - [ ] Measure and optimize

### Queue Optimization

- [ ] Implement job enqueueing optimization
  - [ ] Target: < 10ms per job
  - [ ] Batch enqueue if possible
  - [ ] Use connection pooling
- [ ] Implement worker optimization
  - [ ] Tune concurrency (start at 5)
  - [ ] Monitor CPU/memory usage
  - [ ] Scale workers as needed
- [ ] Implement job processing optimization
  - [ ] Parallelize independent operations
  - [ ] Cache frequently accessed data
  - [ ] Optimize database queries

### Session Storage Optimization

- [ ] Implement Redis optimization
  - [ ] Use connection pooling
  - [ ] Implement pipelining
  - [ ] Target: < 10ms per operation
- [ ] Implement PostgreSQL optimization
  - [ ] Index session tables
  - [ ] Optimize queries
  - [ ] Archive old sessions
- [ ] Implement session cleanup
  - [ ] Remove expired sessions from Redis
  - [ ] Archive old sessions to PostgreSQL
  - [ ] Clean up DLQ jobs

### MCP Tool Optimization

- [ ] Implement tool caching
  - [ ] Cache tool list
  - [ ] Cache tool schemas
  - [ ] Invalidate on update
- [ ] Implement tool execution optimization
  - [ ] Parallelize independent tools
  - [ ] Implement tool result caching
  - [ ] Optimize API calls

---

## Deployment & DevOps

### Docker Configuration

- [ ] Verify multi-stage Docker build
- [ ] Optimize Docker image size
- [ ] Implement health checks
  - [ ] `/health` endpoint
  - [ ] Check database connectivity
  - [ ] Check Redis connectivity
  - [ ] Check Slack connectivity

### Environment Configuration

- [ ] Document all environment variables
  - [ ] BullMQ/Redis config
  - [ ] MCP SDK config
  - [ ] Slack bot config
  - [ ] Database config
  - [ ] Session config
- [ ] Implement environment validation
  - [ ] Check required variables
  - [ ] Validate variable formats
  - [ ] Provide helpful error messages

### Monitoring & Observability

- [ ] Implement structured logging
  - [ ] Log all job events
  - [ ] Log all routing decisions
  - [ ] Log all MCP calls
  - [ ] Include request IDs
- [ ] Implement metrics collection
  - [ ] Export Prometheus metrics
  - [ ] Track queue metrics
  - [ ] Track API metrics
  - [ ] Track error rates
- [ ] Implement distributed tracing
  - [ ] Trace requests across services
  - [ ] Track job execution
  - [ ] Identify bottlenecks

### Deployment Checklist

- [ ] Verify all dependencies installed
- [ ] Verify all environment variables set
- [ ] Run database migrations
- [ ] Run tests
- [ ] Build Docker image
- [ ] Push to registry
- [ ] Deploy to Railway
- [ ] Verify health checks
- [ ] Monitor logs
- [ ] Test critical paths

---

## 📊 Implementation Phases

### Phase 1: Core Infrastructure (Week 9)

**Priority**: CRITICAL

- [ ] Install BullMQ + Redis client
- [ ] Create `src/queue/` directory structure
- [ ] Initialize BullMQ queue
- [ ] Implement background worker
- [ ] Install MCP SDK
- [ ] Create `src/mcp-servers/slack/`

**Success Criteria**:

- BullMQ queue operational (< 10ms enqueue time)
- Slack bot responds < 100ms
- Background worker processes jobs

### Phase 2: Slack Integration (Week 9-10)

**Priority**: CRITICAL

- [ ] Implement Slack event handlers
- [ ] Implement user authentication
- [ ] Implement organization mapping
- [ ] Implement job queuing
- [ ] Implement result notification

**Success Criteria**:

- Slack bot responds to @mentions
- Jobs queued in BullMQ
- Results posted to Slack thread

### Phase 3: Orchestrator (Week 10-11)

**Priority**: HIGH

- [ ] Implement custom router (fast + slow path)
- [ ] Implement session manager
- [ ] Integrate with OhMyOpenCode
- [ ] Implement session continuity

**Success Criteria**:

- Router accuracy > 95%
- Session continuity working (Slack ↔ Web)
- OhMyOpenCode integration functional

### Phase 4: MCP Registry (Week 11)

**Priority**: HIGH

- [ ] Implement MCP registry service
- [ ] Extend Prisma schema (if needed)
- [ ] Create Settings UI for MCP connections
- [ ] Implement connection testing

**Success Criteria**:

- MCP connections manageable via UI
- Tool aggregation working
- Connection testing functional

### Phase 5: Background Workers (Week 11-12)

**Priority**: HIGH

- [ ] Implement BullMQ workers
- [ ] Implement retry logic
- [ ] Implement error handling
- [ ] Implement dead letter queue
- [ ] Implement result notification

**Success Criteria**:

- Jobs processed reliably
- Retries working
- Errors handled gracefully

### Phase 6: Real-Time Updates (Week 12)

**Priority**: MEDIUM

- [ ] Implement SSE endpoint
- [ ] Connect BullMQ events to SSE
- [ ] Update frontend to consume SSE
- [ ] Implement progress bar component

**Success Criteria**:

- Real-time progress updates
- Progress bar displays correctly
- Fallback polling works

### Phase 7: Testing & Monitoring (Week 12)

**Priority**: MEDIUM

- [ ] Set up Bull Board UI
- [ ] Add metrics collection
- [ ] Implement E2E testing
- [ ] Implement unit testing

**Success Criteria**:

- Bull Board UI accessible
- Metrics collected and visible
- E2E tests passing

---

## 🎯 Success Metrics

### Week 9-10 (Infrastructure)

- [ ] BullMQ queue operational (< 10ms enqueue time)
- [ ] Slack bot responds < 100ms
- [ ] Background worker processes jobs

### Week 11 (Orchestration)

- [ ] Router accuracy > 95% (keyword + LLM)
- [ ] Session continuity working (Slack ↔ Web)
- [ ] OhMyOpenCode integration functional

### Week 12 (Production Ready)

- [ ] E2E latency < 3s (Slack event → response)
- [ ] Job success rate > 90%
- [ ] Zero data loss (all jobs tracked in DB)
- [ ] Bull Board UI accessible

---

## 🚨 Risk Mitigation

### Risk 1: Slack 3-second Timeout

**Mitigation**: BullMQ + immediate acknowledgment  
**Evidence**: Production pattern from Flowise AI, Activepieces  
**Fallback**: If Redis fails, fallback to in-memory queue (lose durability)

### Risk 2: LLM Routing Failures

**Mitigation**: Hybrid router (fast path + LLM fallback)  
**Evidence**: 90%+ requests match keywords (avoid LLM call)  
**Fallback**: Default to "general" agent if routing fails

### Risk 3: Session Loss (Redis Failure)

**Mitigation**: PostgreSQL cold storage  
**Evidence**: Industry standard 2-tier pattern  
**Fallback**: Rebuild session from PostgreSQL on Redis miss

### Risk 4: MCP Server Downtime

**Mitigation**: Circuit breaker + graceful degradation  
**Evidence**: Production pattern from n8n, Activepieces  
**Fallback**: Disable failing MCP, notify user, continue with available tools

### Risk 5: Over-Engineering

**Mitigation**: Start with Custom Router, upgrade to LangGraph only if needed  
**Evidence**: 80% of production systems use simple routing  
**Validation Point**: If > 20% of requests need multi-step workflows → consider LangGraph

---

## 📝 Notes

- All tasks are based on research/architecture/01-synthesis-and-decisions.md
- Implementation should follow the phased approach (Week 9-12)
- Each phase has clear success criteria
- Risk mitigation strategies are documented
- Performance targets are specified
- Testing requirements are comprehensive

---

**Document Version**: 1.0  
**Last Updated**: 2026-01-26  
**Status**: Ready for Implementation

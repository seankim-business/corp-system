# OpenTelemetry Tracing Guide

This document describes how Nubabel emits manual OpenTelemetry spans for business logic and how to view traces.

## Viewing Traces

1. Configure the OTLP exporter endpoint:

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT="https://your-otel-collector/v1/traces"
```

2. Start the app. The tracer is initialized in `src/instrumentation.ts`.

3. Open your tracing backend (Tempo, Jaeger, Honeycomb, etc.) and search by:

- `service.name` (defaults to `nubabel-backend`)
- `organization.id`
- `user.id`
- span names (see conventions below)

## Span Naming Conventions

Manual spans follow dot-delimited namespaces:

- **Orchestrator**: `orchestrator.<operation>`
  - `orchestrator.orchestrate`
  - `orchestrator.analyze_request`
  - `orchestrator.select_category`
  - `orchestrator.select_skills`
  - `orchestrator.execute`

- **AI Executor**: `ai_executor.<operation>`
  - `ai_executor.execute`
  - `ai_executor.count_tokens`
  - `ai_executor.api_call`
  - `ai_executor.calculate_cost`

- **MCP Clients**: `mcp.<provider>.<tool>`
  - `mcp.notion.get_tasks`
  - `mcp.linear.get_issues`
  - `mcp.github.get_pull_requests`

## Attribute Naming Conventions

### Multi-Tenancy (root spans)

- `organization.id`
- `user.id`
- `environment` (`development`, `staging`, `production`, `test`)

### Orchestrator

- `intent`
- `category`
- `complexity`
- `skills.names` (comma-separated)
- `request.type`
- `request.length`

### AI Executor

- `ai.model`
- `ai.category`
- `ai.provider`
- `ai.endpoint`
- `ai.tokens.input`
- `ai.tokens.output`
- `ai.tokens.input_estimate`
- `ai.cost_usd`
- `ai.duration_ms`
- `ai.finish_reason`

### MCP Clients

- `mcp.provider`
- `mcp.tool`
- `mcp.connection_id`
- `result.count`
- Provider-specific IDs (e.g., `notion.database_id`, `linear.issue_id`, `github.issue_number`)

## Common Trace Patterns

### Orchestrator Request Flow

```
orchestrator.orchestrate
  ├─ orchestrator.analyze_request
  ├─ orchestrator.select_category
  ├─ orchestrator.select_skills
  └─ orchestrator.execute
```

### AI Execution Flow

```
ai_executor.execute
  ├─ ai_executor.count_tokens
  ├─ ai_executor.api_call
  └─ ai_executor.calculate_cost
```

### MCP Tool Call

```
mcp.<provider>.<tool>
```

## Error Handling

- All spans record exceptions via `recordException(error)`
- `SpanStatusCode.ERROR` is set on failures
- Spans always end in `finally` blocks

## Notes

- Avoid sensitive data in span attributes (tokens, passwords, secrets)
- Keep total spans per request < 100
- Use `startActiveSpan` to preserve parent-child relationships

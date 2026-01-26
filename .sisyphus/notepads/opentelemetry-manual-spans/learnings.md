## 2026-01-26

- Added manual OpenTelemetry spans for orchestrator, AI executor, and MCP clients using `startActiveSpan` with consistent attribute naming.
- MCP client spans include provider/tool/connection attributes plus organization/user/environment context when available.
- AI executor token count span uses a lightweight word-based estimate to avoid blocking requests.

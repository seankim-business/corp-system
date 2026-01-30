# Slack Response Formatter - i18n Implementation

## Overview
The Slack response formatter now supports both Korean and English messages with language-specific error types.

## Supported Languages
- `ko` (Korean) - Default
- `en` (English)

## Error Types
- `budget` - Budget limit reached
- `rate_limit` - Rate limiting
- `mcp` - MCP integration failure
- `generic` - Generic error with correlation ID

## API Changes

### formatErrorMessage
**New signature:**
```typescript
formatErrorMessage(options: ErrorMessageOptions): SlackBlock[]

interface ErrorMessageOptions {
  errorMessage?: string;
  agentId?: string;
  language?: Language; // 'ko' | 'en'
  errorType?: ErrorType; // 'budget' | 'rate_limit' | 'mcp' | 'generic'
  errorId?: string;
  serviceName?: string;
}
```

**Legacy signature (still supported):**
```typescript
formatErrorMessage(errorMessage: string, agentId?: string): SlackBlock[]
```

### Other Functions
All formatting functions now accept optional `language` parameter:

```typescript
formatProcessingMessage(agent: AgentConfig, language?: Language)
formatClarificationQuestion(candidates: AgentConfig[], language?: Language)
formatMultiAgentStart(agents: AgentConfig[], language?: Language)
formatApprovalButtons(approvalId: string, language?: Language)
formatAgentContext(skills: SkillConfig[], sopPath?: string, language?: Language)
```

## Usage Examples

### Budget Exhausted Error

**Korean:**
```typescript
formatErrorMessage({
  errorType: "budget",
  language: "ko"
})
// Output: "예산 한도에 도달했습니다. 관리자에게 문의하세요."
```

**English:**
```typescript
formatErrorMessage({
  errorType: "budget",
  language: "en"
})
// Output: "Budget limit reached. Contact admin."
```

### Rate Limit Error

**Korean:**
```typescript
formatErrorMessage({
  errorType: "rate_limit",
  language: "ko"
})
// Output: "잠시 후 다시 시도해주세요."
```

**English:**
```typescript
formatErrorMessage({
  errorType: "rate_limit",
  language: "en"
})
// Output: "Please try again in a few minutes."
```

### MCP Integration Error

**Korean:**
```typescript
formatErrorMessage({
  errorType: "mcp",
  serviceName: "Slack",
  language: "ko"
})
// Output: "[Slack] 연결에 실패했습니다. 통합 설정을 확인하세요."
```

**English:**
```typescript
formatErrorMessage({
  errorType: "mcp",
  serviceName: "Slack",
  language: "en"
})
// Output: "Failed to connect to [Slack]. Check integration settings."
```

### Generic Error with Correlation ID

**Korean:**
```typescript
formatErrorMessage({
  errorType: "generic",
  errorMessage: "알 수 없는 오류",
  errorId: "abc-123",
  language: "ko"
})
// Output includes correlation ID for debugging
```

**English:**
```typescript
formatErrorMessage({
  errorType: "generic",
  errorMessage: "Unknown error occurred",
  errorId: "abc-123",
  language: "en"
})
// Output includes correlation ID for debugging
```

### Legacy Usage (Still Works)

```typescript
// Default to Korean
formatErrorMessage("오류 발생", "agent-1")
```

## Context Messages

### Processing Message

**Korean:**
```typescript
formatProcessingMessage(agent, "ko")
// "⏳ 요청을 처리하고 있습니다..."
```

**English:**
```typescript
formatProcessingMessage(agent, "en")
// "⏳ Processing your request..."
```

### Agent Context

**Korean:**
```typescript
formatAgentContext(skills, "/path/to/sop", "ko")
// "📋 사용 SOP: `/path/to/sop`"
// "🛠️ 활성 스킬: skill-1, skill-2"
```

**English:**
```typescript
formatAgentContext(skills, "/path/to/sop", "en")
// "📋 Using SOP: `/path/to/sop`"
// "🛠️ Active Skills: skill-1, skill-2"
```

### Approval Buttons

**Korean:**
```typescript
formatApprovalButtons("approval-123", "ko")
// Buttons: "✅ 승인", "❌ 거절"
```

**English:**
```typescript
formatApprovalButtons("approval-123", "en")
// Buttons: "✅ Approve", "❌ Reject"
```

### Multi-Agent Workflow

**Korean:**
```typescript
formatMultiAgentStart([agent1, agent2], "ko")
// "🔄 멀티 에이전트 워크플로우 시작"
// "다음 에이전트들이 협력하여 요청을 처리합니다:"
```

**English:**
```typescript
formatMultiAgentStart([agent1, agent2], "en")
// "🔄 Multi-Agent Workflow Started"
// "The following agents will collaborate to process your request:"
```

## Message Dictionary

All messages are centralized in the `MESSAGES` constant:

```typescript
const MESSAGES = {
  ko: {
    usingSOP: "📋 사용 SOP",
    activeSkills: "🛠️ 활성 스킬",
    processing: "⏳ 요청을 처리하고 있습니다...",
    clarificationNeeded: "🤔 요청을 더 잘 이해하기 위해 확인이 필요합니다...",
    selectAgent: "에이전트 선택...",
    errorOccurred: "오류 발생",
    budgetExhausted: "예산 한도에 도달했습니다. 관리자에게 문의하세요.",
    rateLimited: "잠시 후 다시 시도해주세요.",
    mcpError: "[{service}] 연결에 실패했습니다. 통합 설정을 확인하세요.",
    genericError: "문제가 발생했습니다. 오류 ID: {errorId}",
    multiAgentStart: "🔄 *멀티 에이전트 워크플로우 시작*...",
    approve: "✅ 승인",
    reject: "❌ 거절",
  },
  en: {
    usingSOP: "📋 Using SOP",
    activeSkills: "🛠️ Active Skills",
    processing: "⏳ Processing your request...",
    clarificationNeeded: "🤔 I need clarification to better understand your request...",
    selectAgent: "Select agent...",
    errorOccurred: "Error Occurred",
    budgetExhausted: "Budget limit reached. Contact admin.",
    rateLimited: "Please try again in a few minutes.",
    mcpError: "Failed to connect to [{service}]. Check integration settings.",
    genericError: "Something went wrong. Error ID: {errorId}",
    multiAgentStart: "🔄 *Multi-Agent Workflow Started*...",
    approve: "✅ Approve",
    reject: "❌ Reject",
  },
}
```

## Correlation IDs

All error messages automatically include a correlation ID (UUID) for debugging purposes. This appears in a context block below the main error message:

```
🔍 Error ID: `abc-123-def-456`
```

## Adding New Messages

To add new translatable messages:

1. Add the key to both `ko` and `en` in the `MESSAGES` constant
2. Use `getMessage(key, language)` to retrieve the message
3. Use `formatMessage(template, params)` for messages with placeholders

Example:
```typescript
const MESSAGES = {
  ko: {
    newMessage: "새로운 메시지: {param}",
  },
  en: {
    newMessage: "New message: {param}",
  },
}

// Usage:
const msg = formatMessage(
  getMessage("newMessage", language),
  { param: "value" }
)
```

## Testing

Comprehensive test suite available at:
`src/orchestrator/__tests__/slack-response-formatter.test.ts`

Run tests:
```bash
npm test -- slack-response-formatter.test.ts
```

All 20 tests passing.

/**
 * Agent Tracing Service
 *
 * Provides OpenTelemetry tracing for multi-agent workflow execution.
 * - Creates spans for agent execution
 * - Links parent-child spans for delegation
 * - Traces multi-agent workflows
 */

import { trace, context, SpanKind, SpanStatusCode, Span, Context } from "@opentelemetry/api";
import { logger } from "../utils/logger";

const TRACER_NAME = "nubabel-agent-tracer";
const tracer = trace.getTracer(TRACER_NAME, "1.0.0");

export interface AgentSpanAttributes {
  agentId: string;
  agentType?: string;
  workflowId?: string;
  sessionId?: string;
  organizationId?: string;
  userId?: string;
  prompt?: string;
  category?: string;
}

export interface ToolSpanAttributes {
  agentId: string;
  toolName: string;
  provider?: string;
  input?: string;
}

export interface WorkflowSpanAttributes {
  workflowId: string;
  workflowName: string;
  organizationId: string;
  userId?: string;
  nodeCount?: number;
}

export interface DelegationSpanAttributes {
  fromAgentId: string;
  toAgentId: string;
  taskDescription?: string;
}

/**
 * Start a span for agent execution
 */
export function startAgentSpan(
  attributes: AgentSpanAttributes,
  parentContext?: Context,
): { span: Span; context: Context } {
  const ctx = parentContext || context.active();

  const span = tracer.startSpan(
    `agent.execute.${attributes.agentId}`,
    {
      kind: SpanKind.INTERNAL,
      attributes: {
        "agent.id": attributes.agentId,
        "agent.type": attributes.agentType || "unknown",
        "workflow.id": attributes.workflowId || "",
        "session.id": attributes.sessionId || "",
        "organization.id": attributes.organizationId || "",
        "user.id": attributes.userId || "",
        "agent.category": attributes.category || "",
      },
    },
    ctx,
  );

  const newContext = trace.setSpan(ctx, span);

  logger.debug("Started agent span", {
    agentId: attributes.agentId,
    traceId: span.spanContext().traceId,
    spanId: span.spanContext().spanId,
  });

  return { span, context: newContext };
}

/**
 * End an agent execution span with result
 */
export function endAgentSpan(
  span: Span,
  status: "success" | "failed" | "timeout",
  output?: string,
  error?: Error,
): void {
  if (status === "success") {
    span.setStatus({ code: SpanStatusCode.OK });
    if (output) {
      span.setAttribute("agent.output.length", output.length);
    }
  } else {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error?.message || status,
    });
    if (error) {
      span.recordException(error);
    }
  }

  span.setAttribute("agent.status", status);
  span.end();

  logger.debug("Ended agent span", {
    traceId: span.spanContext().traceId,
    spanId: span.spanContext().spanId,
    status,
  });
}

/**
 * Start a span for tool execution within an agent
 */
export function startToolSpan(
  attributes: ToolSpanAttributes,
  parentContext?: Context,
): { span: Span; context: Context } {
  const ctx = parentContext || context.active();

  const span = tracer.startSpan(
    `tool.execute.${attributes.toolName}`,
    {
      kind: SpanKind.INTERNAL,
      attributes: {
        "agent.id": attributes.agentId,
        "tool.name": attributes.toolName,
        "tool.provider": attributes.provider || "",
      },
    },
    ctx,
  );

  const newContext = trace.setSpan(ctx, span);

  return { span, context: newContext };
}

/**
 * End a tool execution span
 */
export function endToolSpan(span: Span, success: boolean, result?: unknown, error?: Error): void {
  if (success) {
    span.setStatus({ code: SpanStatusCode.OK });
    if (result) {
      span.setAttribute("tool.result.type", typeof result);
    }
  } else {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error?.message || "Tool execution failed",
    });
    if (error) {
      span.recordException(error);
    }
  }

  span.end();
}

/**
 * Start a span for workflow execution
 */
export function startWorkflowSpan(attributes: WorkflowSpanAttributes): {
  span: Span;
  context: Context;
} {
  const span = tracer.startSpan(`workflow.execute.${attributes.workflowName}`, {
    kind: SpanKind.INTERNAL,
    attributes: {
      "workflow.id": attributes.workflowId,
      "workflow.name": attributes.workflowName,
      "organization.id": attributes.organizationId,
      "user.id": attributes.userId || "",
      "workflow.node_count": attributes.nodeCount || 0,
    },
  });

  const newContext = trace.setSpan(context.active(), span);

  logger.debug("Started workflow span", {
    workflowId: attributes.workflowId,
    workflowName: attributes.workflowName,
    traceId: span.spanContext().traceId,
  });

  return { span, context: newContext };
}

/**
 * End a workflow execution span
 */
export function endWorkflowSpan(
  span: Span,
  status: "completed" | "failed" | "waiting_approval",
  duration: number,
  error?: Error,
): void {
  span.setAttribute("workflow.status", status);
  span.setAttribute("workflow.duration_ms", duration);

  if (status === "completed") {
    span.setStatus({ code: SpanStatusCode.OK });
  } else if (status === "failed") {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error?.message || "Workflow execution failed",
    });
    if (error) {
      span.recordException(error);
    }
  } else {
    span.setStatus({ code: SpanStatusCode.OK, message: "Waiting for approval" });
  }

  span.end();

  logger.debug("Ended workflow span", {
    traceId: span.spanContext().traceId,
    status,
    duration,
  });
}

/**
 * Start a span for workflow node/step execution
 */
export function startWorkflowNodeSpan(
  workflowId: string,
  nodeId: string,
  nodeType: string,
  parentContext?: Context,
): { span: Span; context: Context } {
  const ctx = parentContext || context.active();

  const span = tracer.startSpan(
    `workflow.node.${nodeType}.${nodeId}`,
    {
      kind: SpanKind.INTERNAL,
      attributes: {
        "workflow.id": workflowId,
        "workflow.node.id": nodeId,
        "workflow.node.type": nodeType,
      },
    },
    ctx,
  );

  const newContext = trace.setSpan(ctx, span);

  return { span, context: newContext };
}

/**
 * End a workflow node span
 */
export function endWorkflowNodeSpan(
  span: Span,
  status: "success" | "failed",
  duration: number,
  _output?: unknown,
  error?: Error,
): void {
  span.setAttribute("workflow.node.status", status);
  span.setAttribute("workflow.node.duration_ms", duration);

  if (status === "success") {
    span.setStatus({ code: SpanStatusCode.OK });
  } else {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error?.message || "Node execution failed",
    });
    if (error) {
      span.recordException(error);
    }
  }

  span.end();
}

/**
 * Start a span for agent delegation
 */
export function startDelegationSpan(
  attributes: DelegationSpanAttributes,
  parentContext?: Context,
): { span: Span; context: Context } {
  const ctx = parentContext || context.active();

  const span = tracer.startSpan(
    `agent.delegate.${attributes.fromAgentId}->${attributes.toAgentId}`,
    {
      kind: SpanKind.INTERNAL,
      attributes: {
        "delegation.from_agent": attributes.fromAgentId,
        "delegation.to_agent": attributes.toAgentId,
        "delegation.task_description": attributes.taskDescription || "",
      },
    },
    ctx,
  );

  const newContext = trace.setSpan(ctx, span);

  logger.debug("Started delegation span", {
    fromAgent: attributes.fromAgentId,
    toAgent: attributes.toAgentId,
    traceId: span.spanContext().traceId,
  });

  return { span, context: newContext };
}

/**
 * End a delegation span
 */
export function endDelegationSpan(span: Span, success: boolean, error?: Error): void {
  if (success) {
    span.setStatus({ code: SpanStatusCode.OK });
  } else {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error?.message || "Delegation failed",
    });
    if (error) {
      span.recordException(error);
    }
  }

  span.end();
}

/**
 * Utility: Execute a function within a span context
 */
export async function withAgentSpan<T>(
  attributes: AgentSpanAttributes,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const { span, context: spanContext } = startAgentSpan(attributes);

  try {
    const result = await context.with(spanContext, () => fn(span));
    endAgentSpan(span, "success");
    return result;
  } catch (error) {
    endAgentSpan(
      span,
      "failed",
      undefined,
      error instanceof Error ? error : new Error(String(error)),
    );
    throw error;
  }
}

/**
 * Utility: Execute a tool within a span context
 */
export async function withToolSpan<T>(
  attributes: ToolSpanAttributes,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const { span, context: spanContext } = startToolSpan(attributes);

  try {
    const result = await context.with(spanContext, () => fn(span));
    endToolSpan(span, true, result);
    return result;
  } catch (error) {
    endToolSpan(span, false, undefined, error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}

/**
 * Utility: Execute a workflow within a span context
 */
export async function withWorkflowSpan<T>(
  attributes: WorkflowSpanAttributes,
  fn: (span: Span, ctx: Context) => Promise<T>,
): Promise<{ result: T; span: Span }> {
  const { span, context: spanContext } = startWorkflowSpan(attributes);
  const startTime = Date.now();

  try {
    const result = await context.with(spanContext, () => fn(span, spanContext));
    return { result, span };
  } catch (error) {
    const duration = Date.now() - startTime;
    endWorkflowSpan(
      span,
      "failed",
      duration,
      error instanceof Error ? error : new Error(String(error)),
    );
    throw error;
  }
}

/**
 * Get current trace context for propagation
 */
export function getCurrentTraceContext(): { traceId: string; spanId: string } | null {
  const activeSpan = trace.getActiveSpan();
  if (!activeSpan) {
    return null;
  }

  const spanContext = activeSpan.spanContext();
  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
  };
}

/**
 * Add event to current span
 */
export function addSpanEvent(
  name: string,
  attributes?: Record<string, string | number | boolean>,
): void {
  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {
    activeSpan.addEvent(name, attributes);
  }
}

/**
 * Set attribute on current span
 */
export function setSpanAttribute(key: string, value: string | number | boolean): void {
  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {
    activeSpan.setAttribute(key, value);
  }
}

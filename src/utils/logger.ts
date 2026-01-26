import { AsyncLocalStorage } from "async_hooks";

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  correlationId?: string;
  context?: Record<string, any>;
  error?: Error;
}

interface CorrelationContext {
  correlationId: string;
}

/**
 * AsyncLocalStorage for correlation ID
 * Enables correlation ID to be available in all async contexts
 * without passing it through function parameters
 */
const asyncLocalStorage = new AsyncLocalStorage<CorrelationContext>();

/**
 * Set correlation ID in async context
 * Called by correlation-id middleware for each request
 */
export function setCorrelationId(correlationId: string): void {
  asyncLocalStorage.enterWith({ correlationId });
}

/**
 * Get correlation ID from async context
 * Available in all async operations within the request
 */
export function getCorrelationId(): string | undefined {
  return asyncLocalStorage.getStore()?.correlationId;
}

class Logger {
  private logLevel: LogLevel;

  constructor() {
    const envLevel = (process.env.LOG_LEVEL || "info").toLowerCase() as LogLevel;
    this.logLevel = envLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ["debug", "info", "warn", "error"];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const targetLevelIndex = levels.indexOf(level);
    return targetLevelIndex >= currentLevelIndex;
  }

  private formatLog(entry: LogEntry): string {
    const { timestamp, level, message, correlationId, context, error } = entry;
    let log = `[${timestamp}] [${level.toUpperCase()}]`;

    if (correlationId) {
      log += ` [${correlationId}]`;
    }

    log += ` ${message}`;

    if (context) {
      log += ` ${JSON.stringify(context)}`;
    }

    if (error) {
      log += `\n${error.stack}`;
    }

    return log;
  }

  private log(level: LogLevel, message: string, context?: Record<string, any>, error?: Error) {
    if (!this.shouldLog(level)) return;

    const correlationId = getCorrelationId();

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      correlationId,
      context,
      error,
    };

    const formatted = this.formatLog(entry);

    switch (level) {
      case "debug":
        console.debug(formatted);
        break;
      case "info":
        console.info(formatted);
        break;
      case "warn":
        console.warn(formatted);
        break;
      case "error":
        console.error(formatted);
        break;
    }
  }

  debug(message: string, context?: Record<string, any>) {
    this.log("debug", message, context);
  }

  info(message: string, context?: Record<string, any>) {
    this.log("info", message, context);
  }

  warn(message: string, context?: Record<string, any>) {
    this.log("warn", message, context);
  }

  error(message: string, context?: Record<string, any>, error?: Error) {
    this.log("error", message, context, error);
  }
}

export const logger = new Logger();

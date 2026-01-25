import { logger } from "./logger";

interface MetricData {
  name: string;
  value: number;
  tags?: Record<string, string>;
  timestamp?: Date;
}

class MetricsCollector {
  private metrics: MetricData[] = [];
  private flushInterval: NodeJS.Timeout | null = null;

  constructor() {
    if (process.env.NODE_ENV === "production") {
      this.startFlushInterval();
    }
  }

  private startFlushInterval() {
    this.flushInterval = setInterval(() => {
      this.flush();
    }, 60000);
  }

  record(name: string, value: number, tags?: Record<string, string>) {
    const metric: MetricData = {
      name,
      value,
      tags,
      timestamp: new Date(),
    };

    this.metrics.push(metric);

    logger.debug("Metric recorded", {
      metric: name,
      value,
      tags,
    });
  }

  increment(name: string, tags?: Record<string, string>) {
    this.record(name, 1, tags);
  }

  timing(name: string, duration: number, tags?: Record<string, string>) {
    this.record(`${name}.duration`, duration, tags);
  }

  gauge(name: string, value: number, tags?: Record<string, string>) {
    this.record(`${name}.gauge`, value, tags);
  }

  private flush() {
    if (this.metrics.length === 0) return;

    logger.info("Flushing metrics", {
      count: this.metrics.length,
    });

    this.metrics = [];
  }

  shutdown() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flush();
    }
  }
}

export const metrics = new MetricsCollector();

export function measureTime<T>(
  name: string,
  fn: () => T | Promise<T>,
  tags?: Record<string, string>,
): Promise<T> {
  const start = Date.now();

  const measure = (result: T) => {
    const duration = Date.now() - start;
    metrics.timing(name, duration, tags);
    return result;
  };

  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.then(measure);
    }
    return Promise.resolve(measure(result));
  } catch (error) {
    const duration = Date.now() - start;
    metrics.timing(name, duration, { ...tags, error: "true" });
    throw error;
  }
}

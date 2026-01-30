import { spawn } from "child_process";
import { EventEmitter } from "events";
import { logger } from "../../utils/logger";

export interface RailwayService {
  id: string;
  name: string;
  status: "active" | "deploying" | "failed" | "sleeping";
}

export interface RailwayDeployment {
  id: string;
  status: "building" | "deploying" | "success" | "failed" | "cancelled";
  createdAt: string;
  meta?: Record<string, unknown>;
}

export interface RailwayLogEntry {
  timestamp: string;
  message: string;
  level: "info" | "warn" | "error";
}

export interface HealthCheckResult {
  service: string;
  status: "healthy" | "unhealthy" | "unknown";
  responseTime?: number;
  error?: string;
}

type RailwayMonitorEvents = {
  "deployment:started": [deployment: RailwayDeployment];
  "deployment:success": [deployment: RailwayDeployment];
  "deployment:failed": [deployment: RailwayDeployment, error: string];
  "service:status": [service: RailwayService];
  log: [entry: RailwayLogEntry];
  error: [error: Error];
};

export class RailwayMonitorService extends EventEmitter {
  private pollingInterval?: NodeJS.Timeout;
  readonly projectId?: string;
  readonly environmentId?: string;

  constructor(config?: { projectId?: string; environmentId?: string }) {
    super();
    this.projectId = config?.projectId || process.env.RAILWAY_PROJECT_ID;
    this.environmentId = config?.environmentId || process.env.RAILWAY_ENVIRONMENT_ID;
  }

  override emit<K extends keyof RailwayMonitorEvents>(
    event: K,
    ...args: RailwayMonitorEvents[K]
  ): boolean {
    return super.emit(event, ...args);
  }

  override on<K extends keyof RailwayMonitorEvents>(
    event: K,
    listener: (...args: RailwayMonitorEvents[K]) => void,
  ): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  private async executeCommand(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn("railway", args, {
        env: {
          ...process.env,
          RAILWAY_TOKEN: process.env.RAILWAY_TOKEN,
        },
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(stderr || `Railway CLI exited with code ${code}`));
        }
      });

      proc.on("error", (err) => {
        reject(new Error(`Failed to spawn railway CLI: ${err.message}`));
      });
    });
  }

  async getServices(): Promise<RailwayService[]> {
    try {
      const output = await this.executeCommand(["service", "list", "--json"]);
      const services = JSON.parse(output) as Array<{
        id: string;
        name: string;
        status: string;
      }>;

      return services.map((s) => ({
        id: s.id,
        name: s.name,
        status: this.mapServiceStatus(s.status),
      }));
    } catch (error) {
      logger.error("Failed to get Railway services", { error });
      return [];
    }
  }

  async getDeployments(serviceId?: string, limit = 5): Promise<RailwayDeployment[]> {
    try {
      const args = ["deployment", "list", "--json"];
      if (serviceId) args.push("--service", serviceId);
      args.push("--limit", String(limit));

      const output = await this.executeCommand(args);
      const deployments = JSON.parse(output) as Array<{
        id: string;
        status: string;
        createdAt: string;
        meta?: Record<string, unknown>;
      }>;

      return deployments.map((d) => ({
        id: d.id,
        status: this.mapDeploymentStatus(d.status),
        createdAt: d.createdAt,
        meta: d.meta,
      }));
    } catch (error) {
      logger.error("Failed to get Railway deployments", { error });
      return [];
    }
  }

  async getLogs(serviceId: string, lines = 100): Promise<RailwayLogEntry[]> {
    try {
      const output = await this.executeCommand([
        "logs",
        "--service",
        serviceId,
        "--json",
        "-n",
        String(lines),
      ]);

      const logs: RailwayLogEntry[] = [];
      const logLines = output.split("\n").filter(Boolean);

      for (const line of logLines) {
        try {
          const parsed = JSON.parse(line) as {
            timestamp?: string;
            message?: string;
            level?: string;
          };
          logs.push({
            timestamp: parsed.timestamp || new Date().toISOString(),
            message: parsed.message || line,
            level: this.mapLogLevel(parsed.level),
          });
        } catch {
          logs.push({
            timestamp: new Date().toISOString(),
            message: line,
            level: "info",
          });
        }
      }

      return logs;
    } catch (error) {
      logger.error("Failed to get Railway logs", { error, serviceId });
      return [];
    }
  }

  async triggerDeploy(serviceId?: string): Promise<RailwayDeployment | null> {
    try {
      const args = ["up"];
      if (serviceId) args.push("--service", serviceId);

      await this.executeCommand(args);

      const deployments = await this.getDeployments(serviceId, 1);
      const deployment = deployments[0] || null;

      if (deployment) {
        this.emit("deployment:started", deployment);
      }

      return deployment;
    } catch (error) {
      logger.error("Failed to trigger Railway deployment", { error });
      return null;
    }
  }

  async checkHealth(endpoints: string[]): Promise<HealthCheckResult[]> {
    const results: HealthCheckResult[] = [];

    for (const endpoint of endpoints) {
      const start = Date.now();
      try {
        const response = await fetch(endpoint, {
          method: "GET",
          signal: AbortSignal.timeout(10000),
        });

        results.push({
          service: endpoint,
          status: response.ok ? "healthy" : "unhealthy",
          responseTime: Date.now() - start,
        });
      } catch (error) {
        results.push({
          service: endpoint,
          status: "unhealthy",
          responseTime: Date.now() - start,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return results;
  }

  async getStatus(): Promise<{
    services: RailwayService[];
    recentDeployments: RailwayDeployment[];
    health: HealthCheckResult[];
  }> {
    const [services, recentDeployments] = await Promise.all([
      this.getServices(),
      this.getDeployments(undefined, 3),
    ]);

    const healthEndpoints = [
      process.env.RAILWAY_PUBLIC_URL,
      `${process.env.RAILWAY_PUBLIC_URL}/api/health`,
    ].filter(Boolean) as string[];

    const health = await this.checkHealth(healthEndpoints);

    return { services, recentDeployments, health };
  }

  startPolling(intervalMs = 30000): void {
    if (this.pollingInterval) {
      this.stopPolling();
    }

    logger.info("Starting Railway monitoring polling", { intervalMs });

    const poll = async () => {
      try {
        const services = await this.getServices();
        for (const service of services) {
          this.emit("service:status", service);
        }
      } catch (error) {
        this.emit("error", error instanceof Error ? error : new Error(String(error)));
      }
    };

    poll();
    this.pollingInterval = setInterval(poll, intervalMs);
  }

  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = undefined;
      logger.info("Stopped Railway monitoring polling");
    }
  }

  private mapServiceStatus(status: string): RailwayService["status"] {
    const statusMap: Record<string, RailwayService["status"]> = {
      active: "active",
      running: "active",
      deploying: "deploying",
      building: "deploying",
      failed: "failed",
      error: "failed",
      sleeping: "sleeping",
      stopped: "sleeping",
    };
    return statusMap[status.toLowerCase()] || "active";
  }

  private mapDeploymentStatus(status: string): RailwayDeployment["status"] {
    const statusMap: Record<string, RailwayDeployment["status"]> = {
      building: "building",
      deploying: "deploying",
      success: "success",
      completed: "success",
      failed: "failed",
      error: "failed",
      cancelled: "cancelled",
      canceled: "cancelled",
    };
    return statusMap[status.toLowerCase()] || "deploying";
  }

  private mapLogLevel(level?: string): RailwayLogEntry["level"] {
    if (!level) return "info";
    const levelLower = level.toLowerCase();
    if (levelLower.includes("error") || levelLower.includes("err")) return "error";
    if (levelLower.includes("warn")) return "warn";
    return "info";
  }
}

let instance: RailwayMonitorService | null = null;

export function getRailwayMonitor(): RailwayMonitorService {
  if (!instance) {
    instance = new RailwayMonitorService();
  }
  return instance;
}

export default RailwayMonitorService;

import { jest } from "@jest/globals";

jest.mock("@sentry/node", () => ({
  init: jest.fn(),
  setTag: jest.fn(),
  setUser: jest.fn(),
  setContext: jest.fn(),
  captureException: jest.fn(),
  close: jest.fn(),
  Handlers: {
    requestHandler: jest.fn(() => (_req: any, _res: any, next: any) => next()),
    tracingHandler: jest.fn(() => (_req: any, _res: any, next: any) => next()),
    errorHandler: jest.fn(() => (err: any, _req: any, _res: any, next: any) => next(err)),
  },
  Integrations: {
    Http: jest.fn(),
    Express: jest.fn(),
    Prisma: jest.fn(),
  },
}));

jest.mock("@sentry/profiling-node", () => ({
  nodeProfilingIntegration: jest.fn(() => ({ name: "profiling" })),
}));

jest.mock("../../utils/logger", () => ({
  logger: {
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

describe("Sentry service", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("skips initialization when DSN is missing", async () => {
    process.env.SENTRY_DSN = "";
    process.env.NODE_ENV = "production";

    const { initSentry } = await import("../../services/sentry");
    const { logger } = await import("../../utils/logger");
    const Sentry = (await import("@sentry/node")) as any;

    initSentry();

    expect(logger.warn).toHaveBeenCalledWith("SENTRY_DSN not configured, error tracking disabled");
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it("filters ECONNREFUSED errors in beforeSend", async () => {
    process.env.SENTRY_DSN = "https://example@sentry.io/123";
    process.env.NODE_ENV = "production";

    const { initSentry } = await import("../../services/sentry");
    const Sentry = await import("@sentry/node");

    initSentry();

    const initArgs = (Sentry.init as jest.Mock).mock.calls[0][0] as any;
    const result = initArgs.beforeSend(
      { event_id: "1" },
      { originalException: new Error("ECONNREFUSED: connection failed") },
    );

    expect(result).toBeNull();
  });

  it("returns null in development mode", async () => {
    process.env.SENTRY_DSN = "https://example@sentry.io/123";
    process.env.NODE_ENV = "development";

    const { initSentry } = await import("../../services/sentry");
    const Sentry = (await import("@sentry/node")) as any;

    initSentry();

    const initArgs = (Sentry.init as jest.Mock).mock.calls[0][0] as any;
    const result = initArgs.beforeSend(
      { event_id: "2" },
      { originalException: new Error("Random error") },
    );

    expect(result).toBeNull();
  });

  it("sets user context and tags", async () => {
    const { setSentryUser } = await import("../../services/sentry");
    const Sentry = (await import("@sentry/node")) as any;

    setSentryUser("user-1", "org-1", "user@example.com");

    expect(Sentry.setUser).toHaveBeenCalledWith({
      id: "user-1",
      email: "user@example.com",
      organizationId: "org-1",
    });
    expect(Sentry.setTag).toHaveBeenCalledWith("userId", "user-1");
    expect(Sentry.setTag).toHaveBeenCalledWith("organizationId", "org-1");
  });

  it("captures exceptions with additional context", async () => {
    const { captureException } = await import("../../services/sentry");
    const Sentry = (await import("@sentry/node")) as any;

    const error = new Error("Boom");
    captureException(error, { requestId: "req-123" });

    expect(Sentry.setContext).toHaveBeenCalledWith("additional", {
      requestId: "req-123",
    });
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });
});

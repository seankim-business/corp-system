jest.mock("ioredis", () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    xadd: jest.fn().mockResolvedValue("1234567890-0"),
    expire: jest.fn().mockResolvedValue(1),
    publish: jest.fn().mockResolvedValue(0),
    duplicate: jest.fn().mockReturnValue({
      subscribe: jest.fn(),
      on: jest.fn(),
    }),
  }));
});

const workerOnMock = jest.fn();
const workerCloseMock = jest.fn();

jest.mock("bullmq", () => ({
  Queue: jest.fn(),
  Worker: jest.fn().mockImplementation(() => ({
    on: workerOnMock,
    close: workerCloseMock,
  })),
}));

const enqueueNotificationMock = jest.fn();
jest.mock("../../queue/notification.queue", () => ({
  notificationQueue: {
    enqueueNotification: enqueueNotificationMock,
  },
}));

const enqueueFailedJobMock = jest.fn();
jest.mock("../../queue/dead-letter.queue", () => ({
  deadLetterQueue: {
    enqueueFailedJob: enqueueFailedJobMock,
  },
}));

const orchestrateMock = jest.fn();
jest.mock("../../orchestrator", () => ({
  orchestrate: orchestrateMock,
}));

const buildSuccessMessageMock = jest.fn();
const buildErrorMessageMock = jest.fn();
jest.mock("../../services/slack-block-kit", () => ({
  buildSuccessMessage: buildSuccessMessageMock,
  buildErrorMessage: buildErrorMessageMock,
}));

const emitOrgEventMock = jest.fn();
jest.mock("../../services/sse-service", () => ({
  emitOrgEvent: emitOrgEventMock,
}));

describe("OrchestrationWorker", () => {
  let infoSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    buildSuccessMessageMock.mockReturnValue({
      blocks: [{ type: "section", text: { type: "mrkdwn", text: "ok" } }],
    });
    buildErrorMessageMock.mockReturnValue({
      blocks: [{ type: "section", text: { type: "mrkdwn", text: "err" } }],
    });

    infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("should enqueue notification on success", async () => {
    let OrchestrationWorker: any;
    jest.isolateModules(() => {
      ({ OrchestrationWorker } = require("../../workers/orchestration.worker"));
    });
    const worker = new OrchestrationWorker();

    orchestrateMock.mockResolvedValue({
      status: "success",
      output: "done",
      metadata: { category: "quick", skills: [], model: "test" },
    });

    await worker.process({
      id: "job-1",
      name: "execute-orchestration",
      data: {
        userRequest: "do it",
        sessionId: "s1",
        organizationId: "org-1",
        userId: "u1",
        eventId: "evt-1",
        slackChannel: "C1",
        slackThreadTs: "123.456",
      },
      attemptsMade: 0,
      opts: { attempts: 2 },
    });

    expect(orchestrateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userRequest: "do it",
        sessionId: "s1",
        organizationId: "org-1",
        userId: "u1",
      }),
    );
    expect(enqueueNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "C1",
        threadTs: "123.456",
        text: "done",
        organizationId: "org-1",
        userId: "u1",
        eventId: "evt-1",
      }),
    );
    expect(enqueueFailedJobMock).not.toHaveBeenCalled();
  });

  it("should enqueue notification and DLQ on final failure", async () => {
    let OrchestrationWorker: any;
    jest.isolateModules(() => {
      ({ OrchestrationWorker } = require("../../workers/orchestration.worker"));
    });
    const worker = new OrchestrationWorker();

    orchestrateMock.mockRejectedValue(new Error("boom"));

    await expect(
      worker.process({
        id: "job-1",
        name: "execute-orchestration",
        data: {
          userRequest: "do it",
          sessionId: "s1",
          organizationId: "org-1",
          userId: "u1",
          eventId: "evt-1",
          slackChannel: "C1",
          slackThreadTs: "123.456",
        },
        attemptsMade: 2,
        opts: { attempts: 2 },
      }),
    ).rejects.toThrow("boom");

    expect(enqueueNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "C1",
        threadTs: "123.456",
        text: "Error: boom",
        organizationId: "org-1",
        userId: "u1",
        eventId: "evt-1",
      }),
    );

    expect(enqueueFailedJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        originalQueue: "orchestration",
        originalJobId: "job-1",
        failedReason: "boom",
        attempts: 2,
      }),
    );
  });
});

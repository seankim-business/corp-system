jest.mock("ioredis", () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
  }));
});

const addMock = jest.fn();
const onMock = jest.fn();
const closeMock = jest.fn();

jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: addMock,
    on: onMock,
    close: closeMock,
  })),
  Worker: jest.fn(),
}));

describe("OrchestrationQueue", () => {
  let infoSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    addMock.mockResolvedValue({ id: "job-1" });

    infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("should enqueue orchestration job with stable jobId", async () => {
    let OrchestrationQueue: any;
    jest.isolateModules(() => {
      ({ OrchestrationQueue } = require("../../queue/orchestration.queue"));
    });

    const queue = new OrchestrationQueue();
    await queue.enqueueOrchestration({
      userRequest: "do something",
      sessionId: "s1",
      organizationId: "org-1",
      userId: "u1",
      eventId: "evt-1",
      slackChannel: "C1",
      slackThreadTs: "123.456",
    });

    expect(addMock).toHaveBeenCalledWith(
      "execute-orchestration",
      expect.objectContaining({ eventId: "evt-1" }),
      { jobId: "orch-evt-1" },
    );
  });
});

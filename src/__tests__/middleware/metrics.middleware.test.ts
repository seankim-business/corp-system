import { EventEmitter } from "events";
import { metricsMiddleware } from "../../middleware/metrics.middleware";
import { recordHttpRequest } from "../../services/metrics";

jest.mock("../../services/metrics", () => ({
  recordHttpRequest: jest.fn(),
}));

describe("metricsMiddleware", () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it("records HTTP request metrics on response finish", () => {
    const req: any = {
      method: "GET",
      path: "/api/workflows/123",
      route: { path: "/api/workflows/:id" },
    };
    const res = Object.assign(new EventEmitter(), { statusCode: 200 });
    const next = jest.fn();
    jest.spyOn(Date, "now").mockReturnValueOnce(1000).mockReturnValueOnce(1300);

    metricsMiddleware(req, res as any, next);
    res.emit("finish");

    expect(next).toHaveBeenCalledTimes(1);
    expect(recordHttpRequest).toHaveBeenCalledWith({
      method: "GET",
      path: "/api/workflows/:id",
      statusCode: 200,
      duration: 300,
    });
  });
});

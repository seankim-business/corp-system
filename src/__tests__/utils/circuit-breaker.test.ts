import {
  CircuitBreaker,
  CircuitBreakerError,
  getCircuitBreaker,
} from "../../utils/circuit-breaker";

describe("CircuitBreaker", () => {
  let breaker: CircuitBreaker;
  let infoSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    breaker = new CircuitBreaker("test", {
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 1000,
      resetTimeout: 100,
    });
  });

  afterEach(() => {
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  describe("CLOSED state", () => {
    it("should execute successful operations", async () => {
      const result = await breaker.execute(async () => "success");

      expect(result).toBe("success");
      expect(breaker.getState()).toBe("CLOSED");
    });

    it("should count failures but stay closed below threshold", async () => {
      const failingFn = async () => {
        throw new Error("fail");
      };

      await expect(breaker.execute(failingFn)).rejects.toThrow("fail");
      await expect(breaker.execute(failingFn)).rejects.toThrow("fail");

      expect(breaker.getState()).toBe("CLOSED");
      expect(breaker.getStats().failureCount).toBe(2);
    });

    it("should open after reaching failure threshold", async () => {
      const failingFn = async () => {
        throw new Error("fail");
      };

      await expect(breaker.execute(failingFn)).rejects.toThrow();
      await expect(breaker.execute(failingFn)).rejects.toThrow();
      await expect(breaker.execute(failingFn)).rejects.toThrow();

      expect(breaker.getState()).toBe("OPEN");
    });
  });

  describe("OPEN state", () => {
    beforeEach(async () => {
      const failingFn = async () => {
        throw new Error("fail");
      };
      await expect(breaker.execute(failingFn)).rejects.toThrow();
      await expect(breaker.execute(failingFn)).rejects.toThrow();
      await expect(breaker.execute(failingFn)).rejects.toThrow();
    });

    it("should reject immediately when open", async () => {
      await expect(breaker.execute(async () => "success")).rejects.toThrow(CircuitBreakerError);
    });

    it("should transition to HALF_OPEN after reset timeout", async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(breaker.getState()).toBe("OPEN");

      await breaker.execute(async () => "success").catch(() => {});

      expect(breaker.getState()).toBe("HALF_OPEN");
    });
  });

  describe("HALF_OPEN state", () => {
    beforeEach(async () => {
      const failingFn = async () => {
        throw new Error("fail");
      };
      await expect(breaker.execute(failingFn)).rejects.toThrow();
      await expect(breaker.execute(failingFn)).rejects.toThrow();
      await expect(breaker.execute(failingFn)).rejects.toThrow();

      await new Promise((resolve) => setTimeout(resolve, 150));
      await breaker.execute(async () => "probe");
    });

    it("should close after success threshold met", async () => {
      expect(breaker.getState()).toBe("HALF_OPEN");

      await breaker.execute(async () => "success");

      expect(breaker.getState()).toBe("CLOSED");
    });

    it("should reopen on failure in HALF_OPEN", async () => {
      breaker.reset();

      const failingFn = async () => {
        throw new Error("fail");
      };
      await expect(breaker.execute(failingFn)).rejects.toThrow();
      await expect(breaker.execute(failingFn)).rejects.toThrow();
      await expect(breaker.execute(failingFn)).rejects.toThrow();

      await new Promise((resolve) => setTimeout(resolve, 150));

      await breaker.execute(async () => "probe").catch(() => {});

      expect(breaker.getState()).toBe("HALF_OPEN");

      await expect(breaker.execute(failingFn)).rejects.toThrow("fail");

      expect(breaker.getState()).toBe("OPEN");
    });
  });

  describe("timeout", () => {
    it("should timeout slow operations", async () => {
      const slowFn = async () => {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return "slow";
      };

      await expect(breaker.execute(slowFn)).rejects.toThrow(/timed out/);
    });
  });

  describe("reset", () => {
    it("should reset all state", async () => {
      const failingFn = async () => {
        throw new Error("fail");
      };
      await expect(breaker.execute(failingFn)).rejects.toThrow();
      await expect(breaker.execute(failingFn)).rejects.toThrow();
      await expect(breaker.execute(failingFn)).rejects.toThrow();

      expect(breaker.getState()).toBe("OPEN");

      breaker.reset();

      expect(breaker.getState()).toBe("CLOSED");
      expect(breaker.getStats().failureCount).toBe(0);
    });
  });

  describe("getCircuitBreaker factory", () => {
    it("should return same instance for same name", () => {
      const breaker1 = getCircuitBreaker("shared");
      const breaker2 = getCircuitBreaker("shared");

      expect(breaker1).toBe(breaker2);
    });

    it("should return different instances for different names", () => {
      const breaker1 = getCircuitBreaker("first");
      const breaker2 = getCircuitBreaker("second");

      expect(breaker1).not.toBe(breaker2);
    });
  });
});

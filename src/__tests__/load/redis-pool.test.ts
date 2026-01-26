import { getPoolStats, getQueueConnection, releaseQueueConnection } from "../../db/redis";

describe("Redis Connection Pool Load Test", () => {
  it("should handle 100 concurrent requests", async () => {
    const promises: Array<Promise<string | null>> = [];

    for (let i = 0; i < 100; i++) {
      promises.push(
        (async () => {
          const conn = await getQueueConnection();
          try {
            await conn.set(`test:${i}`, `value${i}`);
            return await conn.get(`test:${i}`);
          } finally {
            releaseQueueConnection(conn);
          }
        })(),
      );
    }

    const results = await Promise.all(promises);
    expect(results.length).toBe(100);
  }, 30000);

  it("should not exceed max pool size", async () => {
    const promises: Array<Promise<void>> = [];

    for (let i = 0; i < 50; i++) {
      promises.push(
        (async () => {
          const conn = await getQueueConnection();
          try {
            await new Promise((resolve) => setTimeout(resolve, 100));
          } finally {
            releaseQueueConnection(conn);
          }
        })(),
      );
    }

    await Promise.all(promises);

    const stats = getPoolStats();
    expect(stats.queue.total).toBeLessThanOrEqual(10);
  });
});

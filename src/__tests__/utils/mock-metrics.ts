/**
 * Mock utilities for metrics in tests
 */

export function createMetricsMock() {
  return {
    recordAiRequest: jest.fn(),
    recordMcpToolCall: jest.fn(),
    recordOrchestration: jest.fn(),
    getMetrics: jest.fn().mockReturnValue({
      aiRequests: { total: 0, success: 0, failure: 0 },
      mcpToolCalls: { total: 0, success: 0, failure: 0 },
      orchestrations: { total: 0, success: 0, failure: 0 },
    }),
  };
}

/**
 * K6 Load Testing Suite for Nubabel
 * Run with: k6 run tests/load/k6-load-tests.js
 *
 * Install k6: brew install k6 (macOS) or download from https://k6.io
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const orchestrationDuration = new Trend('orchestration_duration');
const sseConnections = new Counter('sse_connections');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const API_TOKEN = __ENV.API_TOKEN || '';

// Test scenarios
export const options = {
  scenarios: {
    // Smoke test - basic validation
    smoke: {
      executor: 'constant-vus',
      vus: 1,
      duration: '30s',
      startTime: '0s',
      tags: { scenario: 'smoke' },
    },
    // Load test - normal traffic
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 50 },  // Ramp up to 50 users
        { duration: '5m', target: 50 },  // Stay at 50
        { duration: '2m', target: 0 },   // Ramp down
      ],
      startTime: '30s',
      tags: { scenario: 'load' },
    },
    // Stress test - breaking point
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 100 },
        { duration: '5m', target: 100 },
        { duration: '2m', target: 200 },
        { duration: '5m', target: 200 },
        { duration: '2m', target: 0 },
      ],
      startTime: '10m',
      tags: { scenario: 'stress' },
    },
    // Spike test - sudden traffic burst
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 100 },
        { duration: '1m', target: 100 },
        { duration: '10s', target: 500 },
        { duration: '30s', target: 500 },
        { duration: '10s', target: 100 },
        { duration: '1m', target: 0 },
      ],
      startTime: '26m',
      tags: { scenario: 'spike' },
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.01'],
    errors: ['rate<0.05'],
    orchestration_duration: ['p(95)<5000'],
  },
};

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${API_TOKEN}`,
};

// Health check endpoint
export function healthCheck() {
  const res = http.get(`${BASE_URL}/health`);
  check(res, {
    'health check status is 200': (r) => r.status === 200,
    'health check response time < 100ms': (r) => r.timings.duration < 100,
  });
  return res.status === 200;
}

// API authentication test
export function authTest() {
  group('Authentication', () => {
    const loginRes = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({
      email: 'test@example.com',
      password: 'testpassword',
    }), { headers });

    check(loginRes, {
      'login returns 200 or 401': (r) => r.status === 200 || r.status === 401,
      'login response time < 500ms': (r) => r.timings.duration < 500,
    });
  });
}

// Orchestration endpoint load test
export function orchestrationTest() {
  group('Orchestration', () => {
    const startTime = Date.now();

    const res = http.post(`${BASE_URL}/api/orchestrate`, JSON.stringify({
      userRequest: 'Test request for load testing',
      sessionId: `load-test-${__VU}-${__ITER}`,
    }), { headers, timeout: '30s' });

    const duration = Date.now() - startTime;
    orchestrationDuration.add(duration);

    const isSuccess = check(res, {
      'orchestration status is 200 or 202': (r) => r.status === 200 || r.status === 202,
      'orchestration response time < 5s': (r) => r.timings.duration < 5000,
      'orchestration returns valid JSON': (r) => {
        try {
          JSON.parse(r.body);
          return true;
        } catch {
          return false;
        }
      },
    });

    errorRate.add(!isSuccess);
  });
}

// Session management test
export function sessionTest() {
  group('Sessions', () => {
    // Create session
    const createRes = http.post(`${BASE_URL}/api/sessions`, JSON.stringify({
      name: `Load Test Session ${__VU}`,
    }), { headers });

    const createSuccess = check(createRes, {
      'session creation status is 200 or 201': (r) => r.status === 200 || r.status === 201,
    });

    if (createSuccess && createRes.status === 201) {
      const session = JSON.parse(createRes.body);

      // Get session
      const getRes = http.get(`${BASE_URL}/api/sessions/${session.id}`, { headers });
      check(getRes, {
        'session get status is 200': (r) => r.status === 200,
      });

      // List sessions
      const listRes = http.get(`${BASE_URL}/api/sessions`, { headers });
      check(listRes, {
        'session list status is 200': (r) => r.status === 200,
        'session list returns array': (r) => {
          try {
            const data = JSON.parse(r.body);
            return Array.isArray(data) || Array.isArray(data.sessions);
          } catch {
            return false;
          }
        },
      });
    }
  });
}

// SSE connection test
export function sseTest() {
  group('SSE', () => {
    // Note: k6 doesn't natively support SSE, but we can test the endpoint
    const res = http.get(`${BASE_URL}/api/events/poll?since=0-0`, {
      headers,
      timeout: '10s',
    });

    sseConnections.add(1);

    check(res, {
      'SSE poll endpoint responds': (r) => r.status === 200 || r.status === 401,
      'SSE poll response time < 2s': (r) => r.timings.duration < 2000,
    });
  });
}

// Slack webhook simulation
export function slackWebhookTest() {
  group('Slack Webhook', () => {
    const payload = {
      type: 'event_callback',
      event: {
        type: 'app_mention',
        user: 'U12345678',
        text: '<@U87654321> test message',
        channel: 'C12345678',
        ts: String(Date.now() / 1000),
      },
      team_id: 'T12345678',
    };

    const res = http.post(`${BASE_URL}/api/slack/events`, JSON.stringify(payload), {
      headers: {
        'Content-Type': 'application/json',
        'X-Slack-Signature': 'v0=test',
        'X-Slack-Request-Timestamp': String(Math.floor(Date.now() / 1000)),
      },
    });

    check(res, {
      'slack webhook responds': (r) => r.status !== 500,
      'slack webhook response time < 1s': (r) => r.timings.duration < 1000,
    });
  });
}

// Main test function
export default function () {
  // Health check first
  if (!healthCheck()) {
    console.log('Health check failed, skipping other tests');
    sleep(5);
    return;
  }

  // Run test scenarios based on VU distribution
  const testScenario = __VU % 5;

  switch (testScenario) {
    case 0:
      orchestrationTest();
      break;
    case 1:
      sessionTest();
      break;
    case 2:
      sseTest();
      break;
    case 3:
      slackWebhookTest();
      break;
    case 4:
      authTest();
      break;
  }

  // Think time between requests
  sleep(Math.random() * 2 + 1);
}

// Setup function - runs once before tests
export function setup() {
  console.log(`Starting load test against ${BASE_URL}`);

  // Verify API is reachable
  const res = http.get(`${BASE_URL}/health`);
  if (res.status !== 200) {
    throw new Error(`API health check failed: ${res.status}`);
  }

  return { startTime: Date.now() };
}

// Teardown function - runs once after all tests
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`Load test completed in ${duration.toFixed(2)}s`);
}

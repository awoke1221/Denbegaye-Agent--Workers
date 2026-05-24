# Load Testing & Performance Plan

## Executive Summary

This document outlines a comprehensive strategy for validating the Denbegaye Agent Workers platform can handle production-scale traffic with consistent performance and reliability. Testing targets 10,000+ concurrent users, 100k+ requests/minute, and identifies bottlenecks before they impact customers.

---

## 1. Load Testing Objectives

### Goals

1. **Validate SLA Targets**
   - API response time P95 < 200ms
   - API response time P99 < 500ms
   - Error rate < 0.5%
   - Availability > 99.9%

2. **Identify Bottlenecks**
   - CPU/memory saturation points
   - Database connection pool limits
   - Redis throughput ceiling
   - Network bandwidth constraints

3. **Establish Baselines**
   - Normal load profile
   - Peak load profile
   - Stress testing thresholds

4. **Validate Auto-Scaling**
   - Horizontal scaling behavior
   - Load balancer distribution
   - Database connection handling

---

## 2. Load Testing Scenarios

### Scenario 1: Normal Load (Baseline)

**Profile:** Typical weekday usage

| Metric           | Value                                      |
| ---------------- | ------------------------------------------ |
| Concurrent Users | 1,000                                      |
| Requests/Minute  | 10,000                                     |
| Duration         | 30 minutes                                 |
| Ramp-up          | 5 minutes (linear)                         |
| Distribution     | 70% API calls, 20% WebSocket, 10% webhooks |

**Success Criteria:**

- P95 latency < 200ms
- P99 latency < 500ms
- Error rate < 0.5%
- No timeouts

### Scenario 2: Peak Load

**Profile:** Sudden traffic spike (e.g., product launch)

| Metric           | Value                                |
| ---------------- | ------------------------------------ |
| Concurrent Users | 10,000                               |
| Requests/Minute  | 100,000                              |
| Duration         | 15 minutes                           |
| Ramp-up          | 2 minutes (aggressive)               |
| Distribution     | 60% API, 25% WebSocket, 15% webhooks |

**Success Criteria:**

- P95 latency < 500ms (degraded but acceptable)
- P99 latency < 1s
- Error rate < 2%
- Queue backlog < 10% (jobs complete within 2h)

### Scenario 3: Sustained Load

**Profile:** Black Friday / sustained peak for hours

| Metric           | Value                                |
| ---------------- | ------------------------------------ |
| Concurrent Users | 5,000                                |
| Requests/Minute  | 50,000                               |
| Duration         | 4 hours                              |
| Ramp-up          | 10 minutes (gradual)                 |
| Distribution     | 70% API, 15% WebSocket, 15% webhooks |

**Success Criteria:**

- P95 latency < 300ms (stable)
- P99 latency < 700ms
- Error rate < 1%
- Memory usage stable (no leaks)
- CPU < 80%

### Scenario 4: Stress Testing (Breaking Point)

**Profile:** Beyond normal operation; identify limits

| Metric           | Value          |
| ---------------- | -------------- |
| Concurrent Users | 20,000+        |
| Requests/Minute  | 200,000+       |
| Duration         | 10 minutes     |
| Ramp-up          | 1 minute (max) |
| Distribution     | Random         |

**Success Criteria:**

- System doesn't crash
- Error rate < 10%
- Graceful degradation (slower, not broken)
- Recovery time < 5 minutes after spike

### Scenario 5: Rate Limiting Validation

**Profile:** Verify rate limits don't cause cascading failures

| Metric      | Value                                |
| ----------- | ------------------------------------ |
| Single IP   | 100 requests/minute (limit: 60)      |
| Single User | 2,000 requests/minute (limit: 1,000) |
| Concurrent  | 5,000 users                          |
| Duration    | 15 minutes                           |

**Success Criteria:**

- Rate-limited requests return 429 (not 500)
- Retry-After headers correct
- Other users unaffected
- Rate limit reset accurate

---

## 3. Load Testing Tools

### Recommended Tools

| Tool              | Best For                                 | Cost        | Setup                    |
| ----------------- | ---------------------------------------- | ----------- | ------------------------ |
| **k6**            | JavaScript-based, simple scripting, SaaS | Free/Paid   | npm install k6           |
| **Apache JMeter** | Complex scenarios, Enterprise            | Open source | GUI-based                |
| **Locust**        | Python-based, distributed, UI            | Open source | pip install locust       |
| **Artillery**     | Node.js, YAML config, CI/CD friendly     | Open source | npm install -g artillery |
| **Gatling**       | Scala-based, high throughput, simulation | Open source | Compile scripts          |

### Recommended Stack

**Primary:** k6 (lightweight, scriptable, fast feedback)

```bash
npm install -g k6
```

**Secondary:** Artillery (CI/CD integration, realistic scenarios)

```bash
npm install -g artillery
```

---

## 4. k6 Load Test Scripts

### Basic Load Test Template

```javascript
// load-test-api.js
import http from "k6/http";
import { check, group, sleep } from "k6";

const BASE_URL = "https://denbegaye-workers.dev";
const API_TOKEN = __ENV.API_TOKEN;

export let options = {
  vus: 1000, // Virtual Users
  duration: "30m", // 30 minutes
  thresholds: {
    http_req_duration: ["p(95)<200", "p(99)<500"], // Response time SLA
    http_req_failed: ["rate<0.005"], // Error rate < 0.5%
  },
  rampUp: {
    startVUs: 0,
    stages: [
      { duration: "5m", target: 1000 }, // Ramp up to 1000 over 5 min
      { duration: "20m", target: 1000 }, // Sustain
      { duration: "5m", target: 0 }, // Ramp down
    ],
  },
};

export default function () {
  group("API - Agent Execution", () => {
    let response = http.post(
      `${BASE_URL}/api/agent-run`,
      JSON.stringify({
        agentId: "test-agent",
        input: "test query",
        parameters: { timeout: 30000 },
      }),
      {
        headers: {
          Authorization: `Bearer ${API_TOKEN}`,
          "Content-Type": "application/json",
        },
      },
    );

    check(response, {
      "status 200": (r) => r.status === 200,
      "response time < 500ms": (r) => r.timings.duration < 500,
      "body has execution_id": (r) => r.body.includes("execution_id"),
    });
  });

  group("API - Health Check", () => {
    let response = http.get(`${BASE_URL}/api/health`);
    check(response, {
      "status 200": (r) => r.status === 200,
      "response time < 100ms": (r) => r.timings.duration < 100,
    });
  });

  sleep(1); // 1 second between requests
}
```

**Run:**

```bash
export API_TOKEN=<your-test-token>
k6 run load-test-api.js
```

### WebSocket Streaming Test

```javascript
// load-test-websocket.js
import ws from "k6/ws";
import { check } from "k6";

const BASE_URL = "wss://denbegaye-workers.dev";
const API_TOKEN = __ENV.API_TOKEN;

export let options = {
  vus: 500, // WebSocket connections
  duration: "15m",
  thresholds: {
    ws_connecting: ["p(95)<2000"], // Connection time
    ws_session_duration: ["p(95)<30000"], // 30 sec session
  },
};

export default function () {
  const url = `${BASE_URL}/api/stream?token=${API_TOKEN}`;

  ws.connect(
    url,
    {
      tags: { name: "WebSocket" },
    },
    function (socket) {
      socket.on("open", () => {
        console.log("WebSocket connected");
        socket.send(
          JSON.stringify({
            type: "subscribe",
            channel: "execution_updates",
          }),
        );
      });

      socket.on("message", (data) => {
        check(JSON.parse(data), {
          "message has type": (msg) => msg.type !== undefined,
          "timestamp exists": (msg) => msg.timestamp !== undefined,
        });
      });

      socket.on("error", (e) => {
        console.error("Error:", e);
      });

      socket.setTimeout(() => {
        socket.close();
      }, 30000); // 30 second session
    },
  );
}
```

### Rate Limiting Test

```javascript
// load-test-rate-limit.js
import http from "k6/http";
import { check } from "k6";

const BASE_URL = "https://denbegaye-workers.dev";

export let options = {
  vus: 100,
  duration: "5m",
  thresholds: {
    rate_limit_429: ["count>0"], // Expect some 429s
    rate_limit_correct: ["rate>0.95"], // 95%+ correct 429s
  },
};

export default function () {
  // Simulate single user hitting rate limit
  let response = http.post(
    `${BASE_URL}/api/agent-run`,
    JSON.stringify({ agentId: "test" }),
    { headers: { Authorization: "Bearer test-token" } },
  );

  check(response, {
    "429 if rate limited": (r) => {
      if (r.status === 429) {
        let data = JSON.parse(r.body);
        return data.error && data.daily && data.monthly;
      }
      return r.status === 200; // Either 200 or 429 expected
    },
    "Retry-After header present if 429": (r) => {
      if (r.status === 429) {
        return r.headers["Retry-After"] !== undefined;
      }
      return true;
    },
  });

  // All users together to trigger global IP limit (60/min)
  sleep(0.6); // Delay to spread requests
}
```

---

## 5. Artillery Load Test Scripts

### YAML Configuration

```yaml
# load-test-config.yml
config:
  target: "https://denbegaye-workers.dev"
  phases:
    - duration: 300
      arrivalRate: 100
      name: "Normal Load - 100 RPS"
    - duration: 600
      arrivalRate: 500
      name: "Peak Load - 500 RPS"
    - duration: 300
      arrivalRate: 1000
      name: "Stress - 1000 RPS"
  defaults:
    headers:
      Authorization: "Bearer {{ $processEnvironment.API_TOKEN }}"
      Content-Type: "application/json"
  processor: "./processor.js"
  plugins:
    expect: {}

scenarios:
  - name: "API Agent Execution"
    weight: 70
    flow:
      - post:
          url: "/api/agent-run"
          json:
            agentId: "load-test-agent"
            input: "{{ $randomString(50) }}"
          expect:
            - statusCode: 200
            - contentType: json
            - hasProperty: execution_id
          capture:
            json: "$.execution_id"
            as: "executionId"

  - name: "WebSocket Stream"
    weight: 20
    flow:
      - ws:
          target: "wss://{{ target }}/api/stream"
          headers:
            Authorization: "Bearer {{ $processEnvironment.API_TOKEN }}"
          duration: 30
          think: 5

  - name: "Webhook Inbound"
    weight: 10
    flow:
      - post:
          url: "/api/webhook/agent"
          json:
            event: "execution_complete"
            executionId: "{{ executionId }}"
          expect:
            - statusCode: 200
```

**Run:**

```bash
export API_TOKEN=<your-test-token>
artillery run load-test-config.yml
artillery run load-test-config.yml --target https://staging.denbegaye-workers.dev
```

---

## 6. Performance Baselines

### Expected Performance (Based on 2026 Hardware)

| Metric                  | Target         | Current      | Gap   |
| ----------------------- | -------------- | ------------ | ----- |
| API P95 latency         | 200ms          | (to measure) | (TBD) |
| API P99 latency         | 500ms          | (to measure) | (TBD) |
| Job processing P50      | 5s             | (to measure) | (TBD) |
| Error rate              | 0.5%           | (to measure) | (TBD) |
| DB connection pool util | < 70%          | (to measure) | (TBD) |
| Redis CPU               | < 60%          | (to measure) | (TBD) |
| App memory              | < 2GB/instance | (to measure) | (TBD) |

### Measurement & Reporting

After each load test:

1. Export results as JSON
2. Upload to analytics dashboard
3. Compare against baseline
4. Document any regressions
5. Share findings with engineering

---

## 7. Load Testing Schedule

### Pre-Production

- **Initial baseline:** Before first staging deployment
- **Post-feature:** After major feature release
- **Pre-Black Friday:** 2 weeks before peak season
- **Quarterly:** Scheduled performance audit

### Continuous

- **CI/CD:** Lightweight load test on every PR (100 VUs, 5 min)
- **Nightly:** Staging environment soak test (1000 VUs, 2 hours)
- **Weekly:** Production metrics review (no load test)

---

## 8. Bottleneck Identification & Resolution

### Common Bottlenecks & Fixes

| Bottleneck               | Symptom                 | Fix                                |
| ------------------------ | ----------------------- | ---------------------------------- |
| Database connection pool | `pool_exhausted` errors | Increase `POOL_SIZE`               |
| Query performance        | P99 latency > 1s        | Add indexes, optimize query        |
| Redis memory             | Eviction errors         | Increase Redis memory or TTL       |
| CPU saturation           | CPU > 90%               | Add more instances, optimize code  |
| Network bandwidth        | Packet loss, timeouts   | Check network QoS, upgrade         |
| Memory leaks             | Gradual memory growth   | Profile with `--inspect`, fix leak |
| Lock contention          | Database locks          | Reduce transaction scope           |
| Cache hit rate           | High DB load            | Increase cache TTL, preload        |

### Profiling Tools

```bash
# Node.js CPU profiling (while load testing)
node --prof src/server.ts
node --prof-process isolate-*.log > profile.txt

# Memory profiling
node --inspect src/server.ts
# Open chrome://inspect in Chrome, take heap snapshots

# Database query analysis
EXPLAIN ANALYZE SELECT ...;  # In Supabase SQL editor

# Redis profiling
redis-cli --stat   # Monitor memory & throughput
```

---

## 9. Test Environment Setup

### Staging Deployment

```bash
# Ensure staging matches production
npm run deploy:staging

# Verify services
curl https://staging.denbegaye-workers.dev/api/health

# Load test against staging (safe to overload)
k6 run load-test-api.js --vus 5000 --duration 30m
```

### Isolated Test Database

Option: Create separate test database to avoid affecting staging data

```sql
-- In Supabase
CREATE DATABASE denbegaye_loadtest TEMPLATE denbegaye_prod;
-- Update connection string in load test config
```

---

## 10. Reporting & Follow-Up

### Load Test Report Template

```markdown
# Load Test Report - [Date]

## Test Profile

- Tool: k6 / Artillery
- Scenario: Normal Load / Peak Load / Sustained
- Duration: 30 minutes
- Concurrent Users: 1000-10000
- Requests/Minute: 10k-100k

## Key Findings

- API P95 latency: XXX ms (Target: < 200ms)
- API P99 latency: XXX ms (Target: < 500ms)
- Error rate: X.X% (Target: < 0.5%)
- Database connection pool: X% utilized (Target: < 70%)
- Redis CPU: X% (Target: < 60%)

## Bottlenecks Identified

1. [Bottleneck 1] - Impact: [High/Medium/Low]
2. [Bottleneck 2] - Impact: [High/Medium/Low]

## Recommendations

1. [Action 1] - Priority: [P1/P2/P3]
2. [Action 2] - Priority: [P1/P2/P3]

## Next Steps

- [ ] Fix identified bottlenecks
- [ ] Retest on next cycle
- [ ] Monitor in production
```

---

## 11. Integration with Monitoring

### Real-Time Dashboards

During load test, monitor:

- Application metrics (CPU, memory, errors)
- Database performance (query latency, connections)
- Redis statistics (memory, throughput)
- Load balancer distribution

**Tools:** Prometheus + Grafana, Supabase dashboard, Redis Commander

---

## 12. Next Steps

1. **Week 1:** Run baseline load test (normal load scenario)
2. **Week 2:** Run peak load + identify bottlenecks
3. **Week 3:** Implement fixes for critical bottlenecks
4. **Week 4:** Retest to validate improvements
5. **Monthly:** Repeat quarterly performance review

---

## Related Documents

- [SLA Agreement](SLA_AGREEMENT.md) - Performance targets
- [Deployment Guide](DEPLOYMENT_GUIDE.md) - Staging environment
- [CI/CD Pipeline](CI_CD_PIPELINE.md) - Automated testing

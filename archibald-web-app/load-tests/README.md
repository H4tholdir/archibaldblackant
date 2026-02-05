# Archibald WebSocket Load Tests

K6 load testing suite for Archibald WebSocket real-time sync performance validation.

## Prerequisites

### 1. Install K6

**macOS (Homebrew):**
```bash
brew install k6
```

**Ubuntu/Debian:**
```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

**Windows (Chocolatey):**
```powershell
choco install k6
```

**Verify installation:**
```bash
k6 version
```

### 2. Start Backend Server

Ensure the Archibald backend is running on `http://localhost:3000` before running tests:

```bash
cd ../backend
npm run dev
```

Verify WebSocket endpoint is accessible:
```bash
curl http://localhost:3000/api/websocket/health
```

## Running Tests

### Quick Test (5 users, 30 seconds)

Perfect for local development validation:

```bash
npm run test:load:small
```

**Expected performance:**
- Connection time p95: <1s
- Message latency p95: <50ms
- Connection success rate: >99%

### Standard Test (10 users, 5 minutes)

Baseline performance validation:

```bash
npm run test:load:medium
```

**Expected performance:**
- Connection time p95: <1.5s
- Message latency p95: <75ms
- Connection success rate: >99%

### Heavy Load Test (20 users, 10 minutes)

Production readiness validation:

```bash
npm run test:load:large
```

**Expected performance:**
- Connection time p95: <2s
- Message latency p95: <100ms
- Connection success rate: >99%

### Custom Test

Run with custom parameters:

```bash
k6 run --vus <USERS> --duration <TIME> websocket-load.js
```

Examples:
```bash
# 50 users for 2 minutes
k6 run --vus 50 --duration 2m websocket-load.js

# 5 users for 10 seconds (quick smoke test)
k6 run --vus 5 --duration 10s websocket-load.js
```

## Understanding Metrics

### Key Metrics

**connection_time** - Time to establish WebSocket connection
- p95: 95th percentile (target: <2s)
- p99: 99th percentile (target: <3s)
- Lower is better

**message_latency** - Round-trip message latency
- p95: 95th percentile (target: <100ms)
- p99: 99th percentile (target: <150ms)
- **Critical for real-time sync UX**

**connection_success** - Connection establishment success rate
- Target: >99% (0.99)
- Production requirement for reliability

**messages_sent / messages_received** - Message throughput
- Should be balanced (sent ≈ received)
- Verify no message loss

**vus_max** - Peak concurrent virtual users
- Matches test configuration

### Interpreting Results

#### ✅ PASS Example

```
✓ connection_time p(95) < 2000ms  (actual: 1245ms)
✓ message_latency p(95) < 100ms   (actual: 67ms)
✓ connection_success rate > 0.99  (actual: 1.0)
```

**Interpretation:** System performing well, production-ready.

#### ⚠️ WARNING Example

```
✓ connection_time p(95) < 2000ms  (actual: 1890ms)
✗ message_latency p(95) < 100ms   (actual: 142ms)
✓ connection_success rate > 0.99  (actual: 0.995)
```

**Interpretation:** Connection OK, but message latency exceeds target. Consider:
- Broadcast optimization (batch JSON.stringify)
- Reduce ping/pong interval overhead
- Check backend CPU usage

#### ❌ FAIL Example

```
✗ connection_time p(95) < 2000ms  (actual: 3450ms)
✗ message_latency p(95) < 100ms   (actual: 278ms)
✗ connection_success rate > 0.99  (actual: 0.87)
```

**Interpretation:** System under severe stress. Critical issues:
- High connection failure rate (13% failing)
- Latency 2.8x above target
- Likely backend bottleneck or resource exhaustion
- Check memory leaks, connection pool limits

## Performance Baselines

Based on Phase 35 monitoring infrastructure and Phase 36 optimization targets.

### Tier 1: Light Load (5-10 concurrent users)
- Connection time p95: <1s
- Message latency p95: <50ms
- Success rate: 100%
- **Use case:** Development, small deployments

### Tier 2: Medium Load (10-20 concurrent users)
- Connection time p95: <1.5s
- Message latency p95: <75ms
- Success rate: >99%
- **Use case:** Typical production usage

### Tier 3: Heavy Load (20-30 concurrent users)
- Connection time p95: <2s
- Message latency p95: <100ms
- Success rate: >99%
- **Use case:** Peak production load

### Beyond Tier 3 (30+ concurrent users)
If sustained load exceeds 30 users:
- Consider horizontal scaling (clustering)
- Implement Redis pub/sub for multi-instance coordination
- Add load balancer with sticky sessions
- Monitor memory usage closely

## Stress Testing

For advanced stress testing (spike, soak, breakpoint):

```bash
npm run test:stress
```

See `stress-test.js` for stress testing scenarios.

## Troubleshooting

### "Connection refused" errors

**Cause:** Backend not running or wrong port.

**Fix:**
```bash
cd ../backend
npm run dev
# Verify: curl http://localhost:3000/api/websocket/health
```

### High connection failures (rate < 0.99)

**Possible causes:**
- Backend overloaded (check CPU/memory)
- Connection pool exhausted
- Network issues (check localhost connectivity)

**Debug:**
1. Check backend logs for errors
2. Monitor admin dashboard: http://localhost:3000/admin
3. Verify `totalConnections` metric during test
4. Check Node.js process memory: `ps aux | grep node`

### High latency (p95 > 100ms)

**Possible causes:**
- Inefficient broadcast (JSON.stringify per connection)
- High ping/pong overhead (30s interval too frequent)
- CPU bottleneck (check `top` during test)

**Debug:**
1. Profile backend with Chrome DevTools: `node --inspect backend/src/index.ts`
2. Check `averageLatency` in admin dashboard
3. Monitor `messagesSent` metric (high volume = potential bottleneck)

### Memory leaks during soak test

**Symptoms:** Memory usage grows unbounded over time.

**Debug:**
1. Take heap snapshots before/after test
2. Check `latencySamples` array bounded (max 100)
3. Verify WebSocket cleanup on disconnect
4. Look for event listener leaks

## Integration with CI/CD

### Quick Validation (PR checks)

```bash
# Run quick test as smoke test
npm run test:load:small

# Expect: all thresholds pass in <1min
```

### Pre-deployment Validation

```bash
# Run standard test before production deploy
npm run test:load:medium

# Expect: all thresholds pass, latency <75ms p95
```

## Next Steps

After validating performance with load tests:

1. **Optimize bottlenecks** - Apply optimizations from Phase 36 Task 2
2. **Stress test** - Run spike/soak/breakpoint tests (Task 3)
3. **Production monitoring** - Deploy with latency alerts (<100ms)
4. **Scaling plan** - Document when to scale beyond single instance

## References

- **K6 Documentation:** https://k6.io/docs/
- **Phase 35 Monitoring:** Admin dashboard at `/admin` for real-time metrics
- **Phase 36 Plan:** `.planning/phases/36-performance-tuning/36-01-PLAN.md`
- **WebSocket Server:** `archibald-web-app/backend/src/websocket-server.ts`

---

**Performance Target:** <100ms p95 latency for 10-20 concurrent users ✅

# WebSocket Performance Optimization Analysis

**Phase 36-01 Task 2: Latency Optimization & Broadcast Performance**

**Date:** 2026-02-05
**Target:** <100ms p95 latency for 10-20 concurrent users

---

## Code Analysis Results

### WebSocket Real-Time Sync (`websocket-server.ts`)

#### ✅ broadcast() Method (Lines 185-209) - ALREADY OPTIMIZED

```typescript
public broadcast(userId: string, event: WebSocketMessage): void {
  const userConnections = this.connectionPool.get(userId);

  // ✅ JSON.stringify() called ONCE before loop
  const message = JSON.stringify(event);
  let sentCount = 0;

  userConnections.forEach((ws) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(message);  // ✅ Reuses serialized buffer
      sentCount++;
    }
  });
}
```

**Analysis:**
- ✅ Batch broadcast optimization already implemented
- ✅ JSON serialization performed once per broadcast
- ✅ Message buffer reused for all connections
- **No changes needed**

#### ✅ broadcastToAll() Method (Lines 214-233) - ALREADY OPTIMIZED

```typescript
public broadcastToAll(event: WebSocketMessage): void {
  // ✅ JSON.stringify() called ONCE before loop
  const message = JSON.stringify(event);

  this.wss.clients.forEach((ws) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(message);  // ✅ Reuses serialized buffer
      sentCount++;
    }
  });
}
```

**Analysis:**
- ✅ Same optimization pattern as broadcast()
- ✅ Efficient for admin-wide broadcasts
- **No changes needed**

#### ✅ Connection Pool - ALREADY OPTIMAL

```typescript
private connectionPool: Map<string, Set<WebSocket>> = new Map();
```

**Analysis:**
- ✅ O(1) lookup time for user connections
- ✅ Set for efficient duplicate prevention
- ✅ Automatic cleanup on disconnect
- **No changes needed**

#### ✅ Ping/Pong Heartbeat - INDUSTRY STANDARD

```typescript
this.pingInterval = setInterval(() => {
  this.wss.clients.forEach((ws) => {
    if ((ws as any).isAlive === false) {
      return ws.terminate();
    }
    (ws as any).isAlive = false;
    (ws as any).pingTime = Date.now();
    ws.ping();
  });
}, 30000);  // 30 seconds - industry standard
```

**Analysis:**
- ✅ 30s interval is industry best practice
- ✅ Balances overhead vs zombie detection speed
- ✅ Latency tracking integrated with ping/pong
- **No changes needed** (tuning to 45s/60s only if 50+ users show degradation)

#### ✅ Latency Tracking - BOUNDED MEMORY

```typescript
this.metrics.latencySamples.push(latency);
// Keep only last 100 samples
if (this.metrics.latencySamples.length > 100) {
  this.metrics.latencySamples.shift();
}
```

**Analysis:**
- ✅ Rolling window of 100 samples
- ✅ No memory leaks (bounded array)
- ✅ Sufficient for accurate rolling average
- **No changes needed**

---

### Cache Invalidation Broadcast (`price-endpoints.ts`)

#### ⚠️ OPTIMIZATION APPLIED - Lines 101-125

**Before (inefficient):**
```typescript
wssInstance.clients.forEach((client: WebSocket) => {
  if (client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(invalidationEvent));  // ❌ Repeated serialization
    broadcastCount++;
  }
});
```

**After (optimized):**
```typescript
// Serialize once for all clients (broadcast optimization)
const message = JSON.stringify(invalidationEvent);

wssInstance.clients.forEach((client: WebSocket) => {
  if (client.readyState === WebSocket.OPEN) {
    client.send(message);  // ✅ Reuses serialized buffer
    broadcastCount++;
  }
});
```

**Impact:**
- ⚠️ Minor impact (cache invalidation not in hot path)
- ✅ Consistency with broadcast best practices
- ✅ Reduces CPU usage during Excel imports
- **Applied for code consistency**

---

## Summary of Optimizations

### Applied Changes
1. **price-endpoints.ts**: Moved JSON.stringify() outside forEach loop for cache invalidation broadcast

### No Changes Needed (Already Optimized)
1. **websocket-server.ts broadcast()**: JSON serialization already batched
2. **websocket-server.ts broadcastToAll()**: JSON serialization already batched
3. **Connection pool**: Map<userId, Set<WebSocket>> already O(1)
4. **Ping/pong interval**: 30s industry standard, no tuning needed yet
5. **Latency samples**: Bounded array (max 100), no memory leaks

---

## Performance Considerations

### Current Architecture Strengths
- ✅ Singleton pattern prevents multiple WebSocket servers
- ✅ Efficient connection pool with O(1) user lookup
- ✅ Broadcast optimization (JSON.stringify once per message)
- ✅ Bounded memory usage (rolling latency window)
- ✅ Industry-standard heartbeat (30s ping/pong)

### Potential Future Optimizations (If Needed)
These optimizations should **ONLY** be applied if load testing reveals bottlenecks:

1. **MessagePack Serialization** (if CPU-bound)
   - Replace JSON.stringify with MessagePack
   - Pros: Faster serialization, smaller payload
   - Cons: Requires client+server changes, added complexity
   - **When:** If p95 latency >100ms AND profiling shows JSON.stringify() as bottleneck

2. **Ping/Pong Interval Tuning** (if high overhead)
   - Increase from 30s to 45s or 60s
   - Pros: Reduced overhead for high connection counts
   - Cons: Slower zombie connection detection
   - **When:** If 50+ concurrent users show ping/pong overhead in CPU profiling

3. **WebSocket Clustering** (if single-instance limits reached)
   - Multi-instance WebSocket with Redis pub/sub
   - Pros: Horizontal scalability beyond single server
   - Cons: Significant complexity, Redis dependency
   - **When:** If >100 concurrent users OR single-instance CPU/memory maxed

---

## Load Testing Requirements

### Baseline Measurements Needed

To validate current performance and determine if further optimizations are required:

1. **Start backend with production configuration:**
   ```bash
   cd archibald-web-app/backend
   npm run dev
   ```

2. **Run K6 load tests:**
   ```bash
   cd archibald-web-app/load-tests

   # Quick test (5 users, 30s)
   npm run test:load:small

   # Standard test (10 users, 5min)
   npm run test:load:medium

   # Heavy test (20 users, 10min)
   npm run test:load:large
   ```

3. **Monitor admin dashboard:**
   - Open: http://localhost:3000/admin
   - Check: `averageLatency`, `totalConnections`, `messagesSent`
   - Verify: Latency stays <100ms during load

### Success Criteria

- ✅ Connection time p95: <2s
- ✅ Message latency p95: <100ms (10-20 users)
- ✅ Message latency p99: <150ms
- ✅ Connection success rate: >99%
- ✅ No memory leaks during sustained load
- ✅ Admin dashboard averageLatency: <100ms

### If Baseline Fails (<100ms target not met)

1. Run Node.js profiler: `node --inspect backend/src/index.ts`
2. Identify bottleneck with Chrome DevTools Profiler (flame graphs)
3. Apply targeted optimization from "Potential Future Optimizations" list
4. Re-run K6 test and compare before/after metrics
5. Revert if no measurable improvement

---

## Conclusion

**Current Status:** ✅ **Code is production-ready from optimization perspective**

- WebSocket real-time sync implementation follows broadcast best practices
- Minor optimization applied to price-endpoints for consistency
- No premature optimizations introduced
- Ready for load testing to establish performance baseline

**Next Steps:**
1. Run K6 load tests with backend running (Task 3: Stress Testing)
2. Measure actual p95/p99 latency under 10-20 concurrent users
3. Apply further optimizations **ONLY IF** measurements show bottlenecks
4. Document results in PERFORMANCE-REPORT.md

---

**Analysis performed:** 2026-02-05
**Files analyzed:** websocket-server.ts, price-endpoints.ts, index.ts
**Optimizations applied:** 1 (price-endpoints.ts broadcast)
**Optimizations deferred:** 0 (code already optimal)

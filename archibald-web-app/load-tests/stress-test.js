import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';
import exec from 'k6/execution';

// Custom metrics
const connectionTime = new Trend('connection_time', true);
const messageLatency = new Trend('message_latency', true);
const connectionSuccess = new Rate('connection_success');
const connectionFailures = new Counter('connection_failures');
const messagesReceived = new Counter('messages_received');
const messagesSent = new Counter('messages_sent');
const messageLoss = new Counter('message_loss');

// Stress test scenarios - run ONE at a time by uncommenting
export const options = {
  // ===== SPIKE TEST: Sudden traffic surge =====
  // Tests system resilience to sudden load spikes
  scenarios: {
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },  // Rapid spike to 50 users
        { duration: '2m', target: 50 },   // Hold peak for 2 minutes
        { duration: '30s', target: 0 },   // Rapid drop to 0
      ],
      gracefulRampDown: '30s',
    },

    // ===== SOAK TEST: Sustained load for memory leak detection =====
    // Uncomment to run soak test instead of spike
    // soak: {
    //   executor: 'constant-vus',
    //   vus: 20,
    //   duration: '30m',  // 30 minutes sustained load
    // },

    // ===== BREAKPOINT TEST: Find system limits =====
    // Uncomment to run breakpoint test instead of spike
    // breakpoint: {
    //   executor: 'ramping-vus',
    //   startVUs: 0,
    //   stages: [
    //     { duration: '2m', target: 10 },   // Ramp to 10
    //     { duration: '3m', target: 10 },   // Hold at 10
    //     { duration: '2m', target: 20 },   // Ramp to 20
    //     { duration: '3m', target: 20 },   // Hold at 20
    //     { duration: '2m', target: 30 },   // Ramp to 30
    //     { duration: '3m', target: 30 },   // Hold at 30
    //     { duration: '2m', target: 40 },   // Ramp to 40
    //     { duration: '3m', target: 40 },   // Hold at 40
    //     { duration: '2m', target: 50 },   // Ramp to 50
    //     { duration: '5m', target: 50 },   // Hold at 50
    //     { duration: '2m', target: 60 },   // Ramp to 60
    //     { duration: '5m', target: 60 },   // Hold at 60 (likely breaking point)
    //     { duration: '2m', target: 0 },    // Ramp down
    //   ],
    //   gracefulRampDown: '30s',
    // },
  },

  thresholds: {
    // Relaxed thresholds for stress testing (expect degradation)
    'connection_time': ['p(95)<5000'],        // Allow up to 5s connection time
    'message_latency': ['p(95)<500'],         // Allow up to 500ms latency under stress
    'connection_success': ['rate>0.90'],      // Allow 10% failure under extreme stress
    'connection_failures': ['count<50'],      // Max 50 total connection failures
    'message_loss': ['count<100'],            // Max 100 lost messages
  },
};

// Mock user IDs for testing
const USER_IDS = Array.from({ length: 100 }, (_, i) => `stress-test-user-${i + 1}`);

// Track sent messages for loss detection
const pendingMessages = new Map();

export default function () {
  const userId = USER_IDS[Math.floor(Math.random() * USER_IDS.length)];
  const testToken = `test-jwt-token-${userId}`;
  const url = `ws://localhost:3000/ws/realtime?token=${testToken}&userId=${userId}`;

  const startTime = Date.now();
  let connectionEstablished = false;
  let messagesSentInSession = 0;
  let messagesReceivedInSession = 0;

  const res = ws.connect(url, {}, function (socket) {
    const connTime = Date.now() - startTime;
    connectionTime.add(connTime);
    connectionEstablished = true;
    connectionSuccess.add(1);

    socket.on('open', () => {
      console.log(`[${userId}] Connected in ${connTime}ms (VU: ${exec.vu.idInTest})`);

      // Send burst of test messages
      for (let i = 0; i < 5; i++) {
        const messageId = `${userId}-${Date.now()}-${i}`;
        const timestamp = Date.now();

        pendingMessages.set(messageId, timestamp);

        const testMessage = JSON.stringify({
          type: 'DRAFT_CREATED',
          messageId: messageId,
          timestamp: timestamp,
          payload: {
            id: `draft-${messageId}`,
            title: `Stress Test Draft ${i}`,
            items: Array.from({ length: 10 }, (_, j) => ({
              id: j,
              name: `Item ${j}`,
            })),
          },
        });

        socket.send(testMessage);
        messagesSent.add(1);
        messagesSentInSession++;
      }

      // Continue sending messages periodically
      socket.setInterval(() => {
        if (socket.readyState === 1) { // OPEN
          const messageId = `${userId}-${Date.now()}-ping`;
          const timestamp = Date.now();

          pendingMessages.set(messageId, timestamp);

          socket.send(JSON.stringify({
            type: 'PING',
            messageId: messageId,
            timestamp: timestamp,
          }));

          messagesSent.add(1);
          messagesSentInSession++;
        }
      }, 3000); // Send every 3 seconds (high frequency for stress)
    });

    socket.on('message', (data) => {
      messagesReceived.add(1);
      messagesReceivedInSession++;

      try {
        const message = JSON.parse(data);

        // Measure latency
        if (message.timestamp) {
          const latency = Date.now() - message.timestamp;
          if (latency > 0 && latency < 30000) {
            messageLatency.add(latency);
          }
        }

        // Track message receipt for loss detection
        if (message.messageId && pendingMessages.has(message.messageId)) {
          pendingMessages.delete(message.messageId);
        }

        // Log slow messages
        if (message.timestamp && Date.now() - message.timestamp > 500) {
          console.warn(`[${userId}] Slow message: ${Date.now() - message.timestamp}ms`);
        }
      } catch (e) {
        console.error(`[${userId}] Parse error:`, e.message);
      }
    });

    socket.on('close', (code) => {
      console.log(`[${userId}] Disconnected (code: ${code}, sent: ${messagesSentInSession}, received: ${messagesReceivedInSession})`);

      // Check for message loss
      const lostMessages = pendingMessages.size;
      if (lostMessages > 0) {
        messageLoss.add(lostMessages);
        console.warn(`[${userId}] Lost ${lostMessages} messages`);
      }
    });

    socket.on('error', (e) => {
      console.error(`[${userId}] Error:`, e.error());
      connectionFailures.add(1);
      connectionSuccess.add(0);
    });

    // Keep connection alive for variable duration (stress pattern)
    const connectionDuration = 20000 + Math.random() * 40000; // 20-60s
    socket.setTimeout(() => {
      socket.close();
    }, connectionDuration);
  });

  // Track failed connections
  if (!connectionEstablished || !res || res.status !== 101) {
    connectionSuccess.add(0);
    connectionFailures.add(1);

    console.error(`[${userId}] Connection failed:`, res ? res.status : 'no response');
  }

  check(res, {
    'Connection established': (r) => r && r.status === 101,
  });

  // Variable sleep to simulate realistic user behavior
  sleep(Math.random() * 2);
}

// Teardown - report message loss summary
export function teardown(data) {
  console.log('\n=== STRESS TEST SUMMARY ===');
  console.log(`Total pending (potentially lost) messages: ${pendingMessages.size}`);

  if (pendingMessages.size > 0) {
    console.warn('⚠️  Message loss detected - investigate server message handling');
  } else {
    console.log('✅ No message loss detected');
  }
}

// Summary handler
export function handleSummary(data) {
  const summary = {
    scenario: data.root_group.name,
    metrics: {
      vus_max: data.metrics.vus_max?.values.max,
      connection_time_p95: data.metrics.connection_time?.values['p(95)'],
      connection_time_p99: data.metrics.connection_time?.values['p(99)'],
      message_latency_p95: data.metrics.message_latency?.values['p(95)'],
      message_latency_p99: data.metrics.message_latency?.values['p(99)'],
      message_latency_max: data.metrics.message_latency?.values.max,
      connection_success_rate: data.metrics.connection_success?.values.rate,
      connection_failures: data.metrics.connection_failures?.values.count,
      messages_sent: data.metrics.messages_sent?.values.count,
      messages_received: data.metrics.messages_received?.values.count,
      message_loss: data.metrics.message_loss?.values.count,
    },
    thresholds_passed: {
      connection_time: data.metrics.connection_time?.thresholds?.['p(95)<5000']?.ok,
      message_latency: data.metrics.message_latency?.thresholds?.['p(95)<500']?.ok,
      connection_success: data.metrics.connection_success?.thresholds?.['rate>0.90']?.ok,
      connection_failures: data.metrics.connection_failures?.thresholds?.['count<50']?.ok,
      message_loss: data.metrics.message_loss?.thresholds?.['count<100']?.ok,
    },
  };

  console.log('\n=== STRESS TEST RESULTS ===');
  console.log(JSON.stringify(summary, null, 2));

  return {
    'stdout': JSON.stringify(summary, null, 2),
    'summary.json': JSON.stringify(summary, null, 2),
  };
}

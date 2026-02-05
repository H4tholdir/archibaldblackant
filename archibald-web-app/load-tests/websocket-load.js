import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';

// Custom metrics
const connectionTime = new Trend('connection_time', true);
const messageLatency = new Trend('message_latency', true);
const connectionSuccess = new Rate('connection_success');
const messagesReceived = new Counter('messages_received');
const messagesSent = new Counter('messages_sent');

// Test configuration
export const options = {
  stages: [
    { duration: '5m', target: 10 },   // Ramp-up to 10 users over 5 minutes
    { duration: '10m', target: 10 },  // Stay at 10 users for 10 minutes
    { duration: '2m', target: 20 },   // Spike to 20 users over 2 minutes
    { duration: '5m', target: 20 },   // Stay at 20 users for 5 minutes
    { duration: '3m', target: 0 },    // Ramp-down to 0 users over 3 minutes
  ],
  thresholds: {
    'connection_time': ['p(95)<2000', 'p(99)<3000'],  // Connection time <2s p95, <3s p99
    'message_latency': ['p(95)<100', 'p(99)<150'],    // Message latency <100ms p95, <150ms p99
    'connection_success': ['rate>0.99'],              // 99%+ connection success rate
    'ws_msgs_received': ['count>0'],                  // Verify messages are received
  },
};

// Mock user IDs for testing (simulating different users)
const USER_IDS = Array.from({ length: 50 }, (_, i) => `test-user-${i + 1}`);

export default function () {
  const userId = USER_IDS[Math.floor(Math.random() * USER_IDS.length)];

  // Mock JWT token (in real scenario, would authenticate first)
  // For testing purposes, using a simple test token format
  const testToken = `test-jwt-token-${userId}`;

  const url = `ws://localhost:3000/ws/realtime?token=${testToken}&userId=${userId}`;

  const startTime = Date.now();

  const res = ws.connect(url, {}, function (socket) {
    const connTime = Date.now() - startTime;
    connectionTime.add(connTime);

    socket.on('open', () => {
      connectionSuccess.add(1);
      console.log(`[${userId}] Connected in ${connTime}ms`);

      // Send a test message after connecting
      const sendTime = Date.now();
      const testMessage = JSON.stringify({
        type: 'DRAFT_CREATED',
        payload: {
          id: `draft-${Date.now()}`,
          title: 'Load Test Draft',
          timestamp: Date.now(),
        },
      });

      socket.send(testMessage);
      messagesSent.add(1);

      // Store send time for latency measurement
      socket.setInterval(() => {
        const pingTime = Date.now();
        socket.send(JSON.stringify({
          type: 'PING',
          timestamp: pingTime,
        }));
        messagesSent.add(1);
      }, 5000); // Send ping every 5 seconds
    });

    socket.on('message', (data) => {
      messagesReceived.add(1);

      try {
        const message = JSON.parse(data);

        // Measure latency for messages with timestamps
        if (message.timestamp) {
          const latency = Date.now() - message.timestamp;
          messageLatency.add(latency);
        }

        console.log(`[${userId}] Received: ${message.type} (${data.length} bytes)`);
      } catch (e) {
        console.error(`[${userId}] Failed to parse message:`, e.message);
      }
    });

    socket.on('close', () => {
      console.log(`[${userId}] Disconnected`);
    });

    socket.on('error', (e) => {
      console.error(`[${userId}] WebSocket error:`, e.error());
      connectionSuccess.add(0);
    });

    // Keep connection alive for 30-60 seconds
    const connectionDuration = 30000 + Math.random() * 30000;
    socket.setTimeout(() => {
      console.log(`[${userId}] Closing connection after ${Math.round(connectionDuration / 1000)}s`);
      socket.close();
    }, connectionDuration);
  });

  // If connection failed immediately
  if (!res || res.status !== 101) {
    connectionSuccess.add(0);
    console.error(`[${userId}] Connection failed:`, res ? res.status : 'no response');
  }

  // Check connection was successful
  check(res, {
    'WebSocket connection established': (r) => r && r.status === 101,
  });

  // Small sleep to avoid hammering the server
  sleep(1);
}

// Summary handler - prints final metrics
export function handleSummary(data) {
  return {
    'stdout': JSON.stringify({
      metrics: {
        connection_time_p95: data.metrics.connection_time?.values['p(95)'],
        connection_time_p99: data.metrics.connection_time?.values['p(99)'],
        message_latency_p95: data.metrics.message_latency?.values['p(95)'],
        message_latency_p99: data.metrics.message_latency?.values['p(99)'],
        connection_success_rate: data.metrics.connection_success?.values.rate,
        messages_sent: data.metrics.messages_sent?.values.count,
        messages_received: data.metrics.messages_received?.values.count,
        vus_max: data.metrics.vus_max?.values.max,
      },
      thresholds: {
        connection_time_passed: data.metrics.connection_time?.thresholds?.['p(95)<2000']?.ok,
        message_latency_passed: data.metrics.message_latency?.thresholds?.['p(95)<100']?.ok,
        connection_success_passed: data.metrics.connection_success?.thresholds?.['rate>0.99']?.ok,
      },
    }, null, 2),
  };
}

/**
 * Test script for graceful shutdown
 *
 * This script simulates a long-running operation to test if graceful shutdown works.
 *
 * Usage:
 *   1. Start the backend server: npm run dev
 *   2. In another terminal, run: ts-node src/scripts/test-graceful-shutdown.ts
 *   3. Send SIGTERM to the server: kill -SIGTERM <pid>
 *   4. Observe logs to verify operation completes before shutdown
 */

import axios from "axios";

const API_URL = "http://localhost:5001";

async function login(): Promise<string> {
  const response = await axios.post(`${API_URL}/api/auth/login`, {
    username: "admin",
    password: "admin",
  });
  return response.data.data.token;
}

async function simulateLongOperation(token: string): Promise<void> {
  console.log("🚀 Starting simulated long operation...");

  try {
    // Create a test order (this will be queued and processed)
    const response = await axios.post(
      `${API_URL}/api/orders/create`,
      {
        customerName: "TEST CUSTOMER",
        items: [
          {
            articleCode: "TEST001",
            productName: "Test Product",
            quantity: 1,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const jobId = response.data.data.jobId;
    console.log(`✅ Order queued with jobId: ${jobId}`);
    console.log(`📊 Check status at: ${API_URL}/api/orders/status/${jobId}`);
    console.log("\n💡 Now send SIGTERM to the server process to test graceful shutdown:");
    console.log("   ps aux | grep 'node.*index' | grep -v grep");
    console.log("   kill -SIGTERM <pid>");
    console.log("\n   The server should wait for the order to complete before shutting down.");
  } catch (error: any) {
    console.error("❌ Error:", error.response?.data || error.message);
  }
}

async function checkHealth(): Promise<void> {
  try {
    const response = await axios.get(`${API_URL}/api/health`);
    console.log("💚 Health check:", response.data);
  } catch (error: any) {
    if (error.response?.status === 503) {
      console.log("🟡 Server is draining:", error.response.data);
    } else {
      console.error("❌ Health check failed:", error.message);
    }
  }
}

async function main() {
  console.log("=== Graceful Shutdown Test ===\n");

  // Check initial health
  console.log("1. Checking server health...");
  await checkHealth();
  console.log();

  // Login
  console.log("2. Logging in...");
  const token = await login();
  console.log("✅ Logged in successfully\n");

  // Simulate long operation
  console.log("3. Simulating long operation...");
  await simulateLongOperation(token);
}

main().catch(console.error);

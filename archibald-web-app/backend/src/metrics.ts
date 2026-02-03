/**
 * Prometheus metrics module
 *
 * Provides application metrics for monitoring and observability:
 * - HTTP request metrics (counter, histogram)
 * - Active operations gauge
 * - Queue metrics (job processing, queue size)
 * - Browser pool metrics
 * - System metrics (CPU, memory, event loop)
 */

import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
} from "prom-client";

// Create a custom registry
export const register = new Registry();

// Collect default Node.js metrics (CPU, memory, event loop, etc.)
collectDefaultMetrics({
  register,
  prefix: "archibald_",
});

// HTTP Request Metrics
export const httpRequestCounter = new Counter({
  name: "archibald_http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "path", "status"],
  registers: [register],
});

export const httpRequestDuration = new Histogram({
  name: "archibald_http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "path", "status"],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
  registers: [register],
});

// Active Operations Gauge
export const activeOperationsGauge = new Gauge({
  name: "archibald_active_operations",
  help: "Number of currently active operations",
  registers: [register],
});

// Queue Metrics
export const queueJobsProcessed = new Counter({
  name: "archibald_queue_jobs_processed_total",
  help: "Total number of queue jobs processed",
  labelNames: ["status"], // success, failed
  registers: [register],
});

export const queueJobDuration = new Histogram({
  name: "archibald_queue_job_duration_seconds",
  help: "Duration of queue job processing in seconds",
  labelNames: ["status"],
  buckets: [1, 5, 10, 30, 60, 120, 300, 600],
  registers: [register],
});

export const queueSize = new Gauge({
  name: "archibald_queue_size",
  help: "Number of jobs waiting in queue",
  registers: [register],
});

// Browser Pool Metrics
export const browserPoolSize = new Gauge({
  name: "archibald_browser_pool_size",
  help: "Total number of browsers in pool",
  registers: [register],
});

export const browserPoolAvailable = new Gauge({
  name: "archibald_browser_pool_available",
  help: "Number of available browsers in pool",
  registers: [register],
});

// Sync Service Metrics
export const syncProgress = new Gauge({
  name: "archibald_sync_progress",
  help: "Sync service progress percentage",
  labelNames: ["service"], // customers, products, prices
  registers: [register],
});

export const syncLastSuccessTimestamp = new Gauge({
  name: "archibald_sync_last_success_timestamp",
  help: "Timestamp of last successful sync",
  labelNames: ["service"],
  registers: [register],
});

// Database Metrics
export const dbRecordCount = new Gauge({
  name: "archibald_db_record_count",
  help: "Number of records in database",
  labelNames: ["table"], // customers, products, prices
  registers: [register],
});

// Business Metrics
export const ordersCreated = new Counter({
  name: "archibald_orders_created_total",
  help: "Total number of orders created",
  labelNames: ["status"], // success, failed
  registers: [register],
});

export const orderItemsCount = new Histogram({
  name: "archibald_order_items_count",
  help: "Number of items per order",
  buckets: [1, 2, 3, 5, 10, 20, 50],
  registers: [register],
});

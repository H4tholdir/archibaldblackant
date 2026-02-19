-- Migration 001: Create PostgreSQL schemas
-- Separates data by scope: shared (cross-agent), agents (per-agent), system (infrastructure)

CREATE SCHEMA IF NOT EXISTS shared;
CREATE SCHEMA IF NOT EXISTS agents;
CREATE SCHEMA IF NOT EXISTS system;

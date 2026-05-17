import type { OperationType } from './operation-types';
import type { Conductor } from '../conductor/dispatcher';

let conductorRef: Conductor | null = null;

function setConductorForRouting(c: Conductor | null): void {
  conductorRef = c;
}

type JobStatus = {
  jobId: string;
  type: string;
  userId: string;
  state: 'waiting' | 'active' | 'completed' | 'failed';
  progress: number;
  progressLabel?: string;
  result: Record<string, unknown> | null;
  failedReason: string | undefined;
};

type AgentJob = {
  jobId: string;
  type: string;
  state: string;
  progress: number;
};

type QueueStats = {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  prioritized: number;
};

// Structural stub matching the BullMQ Job shape used by server.ts and the routes.
// At runtime these stubs always return empty/undefined so callers never reach property access;
// the type is needed only for TypeScript satisfaction.
type BullMQJobLike = {
  id: string;
  data: { type: string; userId: string; data: Record<string, unknown>; idempotencyKey: string; timestamp: number };
  progress: number;
  timestamp: number;
  processedOn: number | null;
  finishedOn: number | null;
  returnvalue: Record<string, unknown> | null;
  failedReason: string;
  getState: () => Promise<string>;
  retry: () => Promise<void>;
  remove: () => Promise<void>;
};

// OperationQueue — name kept for backward compatibility (imported by server.ts, routes/operations.ts, routes/sync-status.ts)
type OperationQueue = {
  enqueue: (type: OperationType, userId: string, data: Record<string, unknown>, idempotencyKey?: string, delayMs?: number, priority?: number) => Promise<string>;
  getJobStatus: (jobId: string) => Promise<JobStatus | null>;
  getAgentJobs: (userId: string) => Promise<AgentJob[]>;
  getStats: () => Promise<QueueStats>;
  close: () => Promise<void>;
  queue: {
    getJob: (jobId: string) => Promise<BullMQJobLike | undefined>;
    getJobs: (states: string[], start?: number, end?: number) => Promise<BullMQJobLike[]>;
    getJobCounts: (...states: string[]) => Promise<Record<string, number>>;
    clean: (grace: number, limit: number, status: string) => Promise<string[]>;
    close: () => Promise<void>;
  };
};

function createQueue(): OperationQueue {
  const stubQueue = {
    getJob: async (_jobId: string): Promise<BullMQJobLike | undefined> => undefined,
    getJobs: async (_states: string[], _start?: number, _end?: number): Promise<BullMQJobLike[]> => [],
    getJobCounts: async (..._states: string[]): Promise<Record<string, number>> => ({}),
    clean: async (_grace: number, _limit: number, _status: string): Promise<string[]> => [],
    close: async (): Promise<void> => {},
  };

  return {
    async enqueue(type, userId, data, _idempotencyKey?, _delayMs?, priority?): Promise<string> {
      if (!conductorRef) {
        throw new Error(`Conductor not initialized — cannot enqueue '${type}'. Call setConductorForRouting() first.`);
      }
      const taskId = await conductorRef.enqueueTaskExternal({
        userId,
        taskType: type,
        payload: data,
        priority,
      });
      return taskId.toString();
    },

    async getJobStatus(_jobId): Promise<JobStatus | null> {
      return null;
    },

    async getAgentJobs(_userId): Promise<AgentJob[]> {
      return [];
    },

    async getStats(): Promise<QueueStats> {
      return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, prioritized: 0 };
    },

    async close(): Promise<void> {},

    queue: stubQueue,
  };
}

export { createQueue, setConductorForRouting };
export type { JobStatus, AgentJob, QueueStats, OperationQueue };

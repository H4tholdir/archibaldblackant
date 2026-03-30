import { Queue, type JobsOptions } from 'bullmq';
import { Redis } from 'ioredis';
import {
  OPERATION_PRIORITIES,
  isScheduledSync,
  type OperationType,
  type OperationJobData,
  type OperationJobResult,
} from './operation-types';
import { getQueueForOperation } from './queue-router';
import type { QueueName } from './queue-router';

type JobStatus = {
  jobId: string;
  type: OperationType;
  userId: string;
  state: string;
  progress: number;
  progressLabel?: string;
  result: OperationJobResult | null;
  failedReason: string | undefined;
};

type AgentJob = {
  jobId: string;
  type: OperationType;
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

type RemoveOnComplete = { count: number } | boolean;

function createOperationQueue(
  queueName: string = 'operations',
  redisConfig?: { host: string; port: number },
  removeOnComplete?: RemoveOnComplete,
) {
  const connection = new Redis({
    host: redisConfig?.host ?? process.env.REDIS_HOST ?? 'localhost',
    port: redisConfig?.port ?? parseInt(process.env.REDIS_PORT ?? '6379', 10),
    maxRetriesPerRequest: null,
  });

  const queue = new Queue<OperationJobData, OperationJobResult>(queueName, {
    connection: connection as never,
  });

  function getJobOptions(type: OperationType): JobsOptions {
    const base: JobsOptions = {
      priority: OPERATION_PRIORITIES[type],
      removeOnComplete: removeOnComplete ?? { count: 500 },
      removeOnFail: { age: 3600, count: 100 },
    };

    if (isScheduledSync(type)) {
      return { ...base, attempts: 1 };
    }

    if (type === 'download-ddt-pdf' || type === 'download-invoice-pdf') {
      return { ...base, attempts: 2, backoff: { type: 'fixed', delay: 5000 } };
    }

    return { ...base, attempts: 1 };
  }

  async function enqueue(
    type: OperationType,
    userId: string,
    data: Record<string, unknown>,
    idempotencyKey?: string,
    delayMs?: number,
  ): Promise<string> {
    const jobData: OperationJobData = {
      type,
      userId,
      data,
      idempotencyKey: idempotencyKey ?? `${type}-${userId}-${Date.now()}`,
      timestamp: Date.now(),
    };

    const jobOpts = getJobOptions(type);
    jobOpts.jobId = jobData.idempotencyKey;
    if (delayMs) jobOpts.delay = delayMs;
    const job = await queue.add(type, jobData, jobOpts);
    return job.id!;
  }

  async function getJobStatus(jobId: string): Promise<JobStatus | null> {
    const job = await queue.getJob(jobId);
    if (!job) return null;

    const state = await job.getState();
    return {
      jobId: job.id!,
      type: job.data.type,
      userId: job.data.userId,
      state,
      progress: typeof job.progress === 'number'
        ? job.progress
        : (typeof job.progress === 'object' && job.progress !== null && 'progress' in job.progress)
          ? (job.progress as { progress: number }).progress
          : 0,
      progressLabel: (typeof job.progress === 'object' && job.progress !== null && 'label' in job.progress)
        ? (job.progress as { label: string }).label
        : undefined,
      result: job.returnvalue ?? null,
      failedReason: job.failedReason,
    };
  }

  async function getAgentJobs(userId: string): Promise<AgentJob[]> {
    const jobs = await queue.getJobs(['waiting', 'active', 'delayed', 'prioritized']);
    const result: AgentJob[] = [];

    for (const job of jobs) {
      if (job.data.userId === userId) {
        const state = await job.getState();
        result.push({
          jobId: job.id!,
          type: job.data.type,
          state,
          progress: typeof job.progress === 'number' ? job.progress : 0,
        });
      }
    }

    return result;
  }

  async function getStats(): Promise<QueueStats> {
    const counts = await queue.getJobCounts(
      'waiting',
      'active',
      'completed',
      'failed',
      'delayed',
      'prioritized',
    );
    return {
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
      delayed: counts.delayed ?? 0,
      prioritized: counts.prioritized ?? 0,
    };
  }

  async function close(): Promise<void> {
    await queue.close();
    connection.disconnect();
  }

  return { enqueue, getJobStatus, getAgentJobs, getStats, close, queue };
}

type OperationQueue = ReturnType<typeof createOperationQueue>;

function createMultiQueueEnqueue(
  queues: Record<QueueName, OperationQueue>,
) {
  return async (
    type: OperationType,
    userId: string,
    data: Record<string, unknown>,
    idempotencyKey?: string,
    delayMs?: number,
  ): Promise<string> => {
    const queueName = getQueueForOperation(type);
    return queues[queueName].enqueue(type, userId, data, idempotencyKey, delayMs);
  };
}

function createMultiQueueFacade(
  queues: Record<QueueName, OperationQueue>,
): OperationQueue {
  const allQueues = Object.values(queues);

  const enqueue = createMultiQueueEnqueue(queues);

  async function getJobStatus(jobId: string): Promise<JobStatus | null> {
    for (const q of allQueues) {
      const status = await q.getJobStatus(jobId);
      if (status) return status;
    }
    return null;
  }

  async function getAgentJobs(userId: string): Promise<AgentJob[]> {
    const results = await Promise.all(allQueues.map(q => q.getAgentJobs(userId)));
    return results.flat();
  }

  async function getStats(): Promise<QueueStats> {
    const results = await Promise.all(allQueues.map(q => q.getStats()));
    return results.reduce<QueueStats>(
      (acc, s) => ({
        waiting: acc.waiting + s.waiting,
        active: acc.active + s.active,
        completed: acc.completed + s.completed,
        failed: acc.failed + s.failed,
        delayed: acc.delayed + s.delayed,
        prioritized: acc.prioritized + s.prioritized,
      }),
      { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, prioritized: 0 },
    );
  }

  async function close(): Promise<void> {
    await Promise.all(allQueues.map(q => q.close()));
  }

  const multiQueue = {
    getJob: async (jobId: string) => {
      for (const q of allQueues) {
        const job = await q.queue.getJob(jobId);
        if (job) return job;
      }
      return undefined;
    },
    getJobs: async (states: string[], start?: number, end?: number) => {
      const results = await Promise.all(
        allQueues.map(q => q.queue.getJobs(states as never, start, end)),
      );
      return results.flat();
    },
    getJobCounts: async (...states: string[]) => {
      const results = await Promise.all(
        allQueues.map(q => q.queue.getJobCounts(...(states as never[]))),
      );
      const merged: Record<string, number> = {};
      for (const r of results) {
        for (const [key, val] of Object.entries(r as Record<string, number>)) {
          merged[key] = (merged[key] ?? 0) + val;
        }
      }
      return merged;
    },
    clean: async (grace: number, limit: number, status: string) => {
      const results = await Promise.all(
        allQueues.map(q => q.queue.clean(grace, limit, status as never)),
      );
      return results.flat();
    },
    close: async () => {
      await Promise.all(allQueues.map(q => q.queue.close()));
    },
  };

  return { enqueue, getJobStatus, getAgentJobs, getStats, close, queue: multiQueue as never };
}

export {
  createOperationQueue,
  createMultiQueueEnqueue,
  createMultiQueueFacade,
  type OperationQueue,
  type JobStatus,
  type AgentJob,
  type QueueStats,
  type RemoveOnComplete,
};

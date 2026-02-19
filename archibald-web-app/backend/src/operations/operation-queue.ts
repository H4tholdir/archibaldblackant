import { Queue, type JobsOptions } from 'bullmq';
import { Redis } from 'ioredis';
import {
  OPERATION_PRIORITIES,
  isWriteOperation,
  isScheduledSync,
  type OperationType,
  type OperationJobData,
  type OperationJobResult,
} from './operation-types';

type JobStatus = {
  jobId: string;
  type: OperationType;
  userId: string;
  state: string;
  progress: number;
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

function createOperationQueue(redisConfig?: { host: string; port: number }) {
  const connection = new Redis({
    host: redisConfig?.host ?? process.env.REDIS_HOST ?? 'localhost',
    port: redisConfig?.port ?? parseInt(process.env.REDIS_PORT ?? '6379', 10),
    maxRetriesPerRequest: null,
  });

  const queue = new Queue<OperationJobData, OperationJobResult>('operations', {
    connection: connection as never,
  });

  function getJobOptions(type: OperationType): JobsOptions {
    const base: JobsOptions = {
      priority: OPERATION_PRIORITIES[type],
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    };

    if (isScheduledSync(type)) {
      return { ...base, attempts: 3, backoff: { type: 'exponential', delay: 30000 } };
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
  ): Promise<string> {
    const jobData: OperationJobData = {
      type,
      userId,
      data,
      idempotencyKey: idempotencyKey ?? `${type}-${userId}-${Date.now()}`,
      timestamp: Date.now(),
    };

    const job = await queue.add(type, jobData, getJobOptions(type));
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
      progress: typeof job.progress === 'number' ? job.progress : 0,
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

export {
  createOperationQueue,
  type OperationQueue,
  type JobStatus,
  type AgentJob,
  type QueueStats,
};

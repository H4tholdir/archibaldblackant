import type { OperationType } from './operation-types';
import { isWriteOperation, isScheduledSync } from './operation-types';

type ActiveJob = {
  jobId: string;
  type: OperationType;
  requestStop?: () => void;
};

type AcquireResult =
  | { acquired: true }
  | { acquired: false; activeJob: ActiveJob; preemptable: boolean };

function createAgentLock() {
  const activeJobs = new Map<string, ActiveJob>();

  function acquire(userId: string, jobId: string, type: OperationType): AcquireResult {
    const existing = activeJobs.get(userId);
    if (!existing) {
      activeJobs.set(userId, { jobId, type });
      return { acquired: true };
    }
    const preemptable = isScheduledSync(existing.type) && isWriteOperation(type);
    return {
      acquired: false,
      activeJob: { jobId: existing.jobId, type: existing.type, requestStop: existing.requestStop },
      preemptable,
    };
  }

  function release(userId: string, jobId: string): boolean {
    const active = activeJobs.get(userId);
    if (!active || active.jobId !== jobId) return false;
    activeJobs.delete(userId);
    return true;
  }

  function setStopCallback(userId: string, requestStop: () => void): void {
    const job = activeJobs.get(userId);
    if (job) job.requestStop = requestStop;
  }

  function getActive(userId: string): ActiveJob | undefined {
    return activeJobs.get(userId);
  }

  function getAllActive(): Map<string, ActiveJob> {
    return new Map(activeJobs);
  }

  return { acquire, release, setStopCallback, getActive, getAllActive };
}

type AgentLock = ReturnType<typeof createAgentLock>;

export { createAgentLock, type AgentLock, type ActiveJob, type AcquireResult };

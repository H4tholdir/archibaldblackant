import type { JobEvent } from './sse-progress';

type JobEventCallback = (event: JobEvent) => void;

type OnJobEventFn = (userId: string, callback: JobEventCallback) => () => void;

type PublishFn = (userId: string, event: JobEvent) => void;

type JobEventBus = {
  onJobEvent: OnJobEventFn;
  publish: PublishFn;
  subscriberCount: (userId: string) => number;
};

function createJobEventBus(): JobEventBus {
  const subscribers = new Map<string, Set<JobEventCallback>>();

  const onJobEvent: OnJobEventFn = (userId, callback) => {
    let set = subscribers.get(userId);
    if (!set) {
      set = new Set();
      subscribers.set(userId, set);
    }
    set.add(callback);

    return () => {
      const current = subscribers.get(userId);
      if (!current) return;
      current.delete(callback);
      if (current.size === 0) {
        subscribers.delete(userId);
      }
    };
  };

  const publish: PublishFn = (userId, event) => {
    const set = subscribers.get(userId);
    if (!set) return;
    for (const callback of set) {
      callback(event);
    }
  };

  const subscriberCount = (userId: string): number => {
    return subscribers.get(userId)?.size ?? 0;
  };

  return { onJobEvent, publish, subscriberCount };
}

export { createJobEventBus, type OnJobEventFn, type PublishFn, type JobEventBus };

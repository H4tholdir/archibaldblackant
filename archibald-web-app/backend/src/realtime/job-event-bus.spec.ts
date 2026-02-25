import { describe, expect, test, vi } from 'vitest';
import { createJobEventBus } from './job-event-bus';
import type { JobEvent } from './sse-progress';

const sampleEvent: JobEvent = { event: 'JOB_COMPLETED', data: { jobId: 'j1' } };
const anotherEvent: JobEvent = { event: 'JOB_FAILED', data: { jobId: 'j2', error: 'timeout' } };

describe('createJobEventBus', () => {
  test('publish with no subscribers does not throw', () => {
    const bus = createJobEventBus();

    expect(() => bus.publish('user-1', sampleEvent)).not.toThrow();
  });

  test('onJobEvent registers callback and publish delivers event to it', () => {
    const bus = createJobEventBus();
    const callback = vi.fn();

    bus.onJobEvent('user-1', callback);
    bus.publish('user-1', sampleEvent);

    expect(callback).toHaveBeenCalledWith(sampleEvent);
  });

  test('unsubscribe removes callback so subsequent publish does not deliver', () => {
    const bus = createJobEventBus();
    const callback = vi.fn();

    const unsubscribe = bus.onJobEvent('user-1', callback);
    unsubscribe();
    bus.publish('user-1', sampleEvent);

    expect(callback).not.toHaveBeenCalled();
  });

  test('multiple subscribers for same userId all receive events', () => {
    const bus = createJobEventBus();
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    bus.onJobEvent('user-1', cb1);
    bus.onJobEvent('user-1', cb2);
    bus.publish('user-1', sampleEvent);

    expect(cb1).toHaveBeenCalledWith(sampleEvent);
    expect(cb2).toHaveBeenCalledWith(sampleEvent);
  });

  test('subscribers for different userIds are isolated', () => {
    const bus = createJobEventBus();
    const cbUser1 = vi.fn();
    const cbUser2 = vi.fn();

    bus.onJobEvent('user-1', cbUser1);
    bus.onJobEvent('user-2', cbUser2);

    bus.publish('user-1', sampleEvent);
    bus.publish('user-2', anotherEvent);

    expect(cbUser1).toHaveBeenCalledWith(sampleEvent);
    expect(cbUser1).not.toHaveBeenCalledWith(anotherEvent);
    expect(cbUser2).toHaveBeenCalledWith(anotherEvent);
    expect(cbUser2).not.toHaveBeenCalledWith(sampleEvent);
  });

  test('unsubscribe last subscriber cleans up Map entry', () => {
    const bus = createJobEventBus();
    const callback = vi.fn();

    const unsubscribe = bus.onJobEvent('user-1', callback);
    unsubscribe();

    expect(bus.subscriberCount('user-1')).toBe(0);
  });
});

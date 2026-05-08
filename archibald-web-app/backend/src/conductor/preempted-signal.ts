export class PreemptedSignal extends Error {
  readonly tag = 'preempted' as const;

  constructor() {
    super('Task preempted by higher-priority operation');
    this.name = 'PreemptedSignal';
  }
}

export function isPreemptedSignal(err: unknown): err is PreemptedSignal {
  return (
    err instanceof PreemptedSignal &&
    (err as PreemptedSignal).tag === 'preempted'
  );
}

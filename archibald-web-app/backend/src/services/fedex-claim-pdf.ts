import type { TrackingException } from '../db/repositories/tracking-exceptions';

export async function generateClaimPdf(_exception: TrackingException): Promise<Buffer> {
  throw new Error('Not yet implemented');
}

export function relayTimeout(baseMs: number): number {
  const multiplier = parseFloat(process.env.BOT_RELAY_TIMEOUT_MULTIPLIER ?? '1.0');
  return Math.ceil(baseMs * multiplier);
}

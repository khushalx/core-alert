export function isCronAuthorized(provided: string | null | undefined, expected: string | null | undefined): boolean {
  return Boolean(expected && expected.length >= 24 && provided && provided === expected);
}

export function escalationCutoff(nowMs: number, afterSeconds: number): string {
  const safeSeconds = Number.isFinite(afterSeconds) ? Math.max(30, Math.min(afterSeconds, 3_600)) : 90;
  return new Date(nowMs - safeSeconds * 1_000).toISOString();
}

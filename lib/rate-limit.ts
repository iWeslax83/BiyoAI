// In-memory sliding-window rate limiter. One instance per process is enough:
// the app runs as a single Node process on the school PC.

type Options = { limit: number; windowMs: number };
type Result = { allowed: boolean; retryAfterSeconds: number };

const SWEEP_THRESHOLD = 1000;

export function createRateLimiter({ limit, windowMs }: Options) {
  const hits = new Map<string, number[]>();

  function sweep(now: number) {
    for (const [key, times] of hits) {
      if (times[times.length - 1] <= now - windowMs) hits.delete(key);
    }
  }

  return {
    check(key: string, now: number = Date.now()): Result {
      if (hits.size > SWEEP_THRESHOLD) sweep(now);

      const recent = (hits.get(key) ?? []).filter((t) => t > now - windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return {
          allowed: false,
          retryAfterSeconds: Math.ceil((recent[0] + windowMs - now) / 1000),
        };
      }
      recent.push(now);
      hits.set(key, recent);
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}

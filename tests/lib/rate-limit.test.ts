import { describe, it, expect } from "vitest";
import { createRateLimiter } from "../../lib/rate-limit";

describe("createRateLimiter", () => {
  it("allows requests up to the limit and blocks the next one", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });
    expect(limiter.check("a", 0).allowed).toBe(true);
    expect(limiter.check("a", 1).allowed).toBe(true);
    expect(limiter.check("a", 2).allowed).toBe(true);
    expect(limiter.check("a", 3).allowed).toBe(false);
  });

  it("allows requests again once the window has passed", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.check("a", 0).allowed).toBe(true);
    expect(limiter.check("a", 30_000).allowed).toBe(false);
    expect(limiter.check("a", 60_001).allowed).toBe(true);
  });

  it("tracks each key independently", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.check("a", 0).allowed).toBe(true);
    expect(limiter.check("b", 0).allowed).toBe(true);
    expect(limiter.check("a", 1).allowed).toBe(false);
  });

  it("reports how many seconds are left until the oldest request expires", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    limiter.check("a", 0);
    const blocked = limiter.check("a", 45_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(15);
  });

  it("does not count blocked requests against the key", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    limiter.check("a", 0);
    limiter.check("a", 10_000);
    limiter.check("a", 20_000);
    expect(limiter.check("a", 60_001).allowed).toBe(true);
  });
});

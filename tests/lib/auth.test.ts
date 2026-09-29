import { describe, it, expect, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";
import {
  hashPassword,
  verifyPassword,
  createSessionCookie,
  isValidSession,
} from "../../lib/auth";

describe("auth", () => {
  const originalSecret = process.env.SESSION_SECRET;

  beforeEach(() => {
    process.env.SESSION_SECRET = "test-secret-that-is-at-least-32-chars-long";
  });

  afterEach(() => {
    process.env.SESSION_SECRET = originalSecret;
  });

  it("hashes and verifies a password", async () => {
    const hash = await hashPassword("gizli-sifre");
    expect(await verifyPassword("gizli-sifre", hash)).toBe(true);
    expect(await verifyPassword("yanlis", hash)).toBe(false);
  });

  it("creates a session cookie that validates against itself", () => {
    const cookie = createSessionCookie();
    expect(isValidSession(cookie)).toBe(true);
  });

  it("rejects a tampered or missing session value", () => {
    expect(isValidSession("garbage")).toBe(false);
    expect(isValidSession(undefined)).toBe(false);
  });

  it("throws when SESSION_SECRET is missing", () => {
    delete process.env.SESSION_SECRET;
    expect(() => createSessionCookie()).toThrow(/SESSION_SECRET/);
  });

  it("throws when SESSION_SECRET is set but shorter than 32 chars", () => {
    process.env.SESSION_SECRET = "too-short";
    expect(() => createSessionCookie()).toThrow(/SESSION_SECRET/);
  });

  it("rejects a session cookie older than 7 days even if the signature is valid", () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    const issuedAt = eightDaysAgo.toString();
    const signature = crypto
      .createHmac("sha256", process.env.SESSION_SECRET ?? "")
      .update(issuedAt)
      .digest("hex");
    expect(isValidSession(`${issuedAt}.${signature}`)).toBe(false);
  });
});

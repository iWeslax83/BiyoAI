import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const queryMock =
  vi.fn<(sql: string, params?: unknown[]) => Promise<unknown[]>>();
vi.mock("../../lib/db", () => ({
  query: (sql: string, params?: unknown[]) => queryMock(sql, params),
}));

import {
  purgeOldQaLogs,
  resetRetentionThrottle,
  retentionDays,
} from "../../lib/retention";

const DAY = 24 * 60 * 60 * 1000;

describe("retentionDays", () => {
  afterEach(() => {
    delete process.env.QA_LOG_RETENTION_DAYS;
  });

  it("defaults to 90 days", () => {
    delete process.env.QA_LOG_RETENTION_DAYS;
    expect(retentionDays()).toBe(90);
  });

  it("reads the configured number of days", () => {
    process.env.QA_LOG_RETENTION_DAYS = "30";
    expect(retentionDays()).toBe(30);
  });

  it("treats 0 as keeping everything", () => {
    process.env.QA_LOG_RETENTION_DAYS = "0";
    expect(retentionDays()).toBe(0);
  });

  it("falls back to the default for an invalid value", () => {
    process.env.QA_LOG_RETENTION_DAYS = "abc";
    expect(retentionDays()).toBe(90);
    process.env.QA_LOG_RETENTION_DAYS = "-5";
    expect(retentionDays()).toBe(90);
  });
});

describe("purgeOldQaLogs", () => {
  beforeEach(() => {
    queryMock.mockReset();
    resetRetentionThrottle();
    delete process.env.QA_LOG_RETENTION_DAYS;
  });

  it("deletes questions older than the retention period and returns how many", async () => {
    queryMock.mockResolvedValue([{ id: 1 }, { id: 2 }]);

    const deleted = await purgeOldQaLogs(1_000);

    expect(deleted).toBe(2);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain("DELETE FROM qa_log");
    expect(params).toEqual([90]);
  });

  it("runs at most once a day", async () => {
    queryMock.mockResolvedValue([]);

    await purgeOldQaLogs(0);
    await purgeOldQaLogs(DAY - 1);
    expect(queryMock).toHaveBeenCalledTimes(1);

    await purgeOldQaLogs(DAY + 1);
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("does nothing when retention is disabled", async () => {
    process.env.QA_LOG_RETENTION_DAYS = "0";

    const deleted = await purgeOldQaLogs(0);

    expect(deleted).toBe(0);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("does not throw when the database call fails, and tries again later", async () => {
    queryMock.mockRejectedValueOnce(new Error("db down"));

    await expect(purgeOldQaLogs(0)).resolves.toBe(0);

    queryMock.mockResolvedValue([{ id: 1 }]);
    await expect(purgeOldQaLogs(1)).resolves.toBe(1);
  });
});

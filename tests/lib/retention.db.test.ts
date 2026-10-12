import { describe, it, expect, beforeAll } from "vitest";

// Uses the real database to prove the part that matters: deleting old
// questions must not delete the teacher notes written about them. Same guard
// as retrieve.test.ts: only runs against a database whose name has "test".
const resolvedDbUrl =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
if (!/test/i.test(resolvedDbUrl)) {
  throw new Error(
    "Refusing to run tests/lib/retention.db.test.ts: it deletes rows and the resolved " +
      `database URL does not look like a disposable test database. Resolved: ${resolvedDbUrl || "(unset)"}`,
  );
}
process.env.DATABASE_URL = resolvedDbUrl;

import { query } from "../../lib/db";
import { purgeOldQaLogs, resetRetentionThrottle } from "../../lib/retention";

const zeroVector = JSON.stringify(new Array(768).fill(0));

beforeAll(async () => {
  await query("DELETE FROM feedback");
  await query("DELETE FROM qa_log");
});

describe("purgeOldQaLogs (database)", () => {
  it("removes old questions but keeps the teacher notes about them", async () => {
    resetRetentionThrottle();
    const [old] = await query<{ id: number }>(
      `INSERT INTO qa_log (question, answer, grounded, created_at)
       VALUES ('eski soru', 'a', true, now() - interval '200 days') RETURNING id`,
    );
    const [recent] = await query<{ id: number }>(
      `INSERT INTO qa_log (question, answer, grounded)
       VALUES ('yeni soru', 'a', true) RETURNING id`,
    );
    await query(
      `INSERT INTO feedback (qa_log_id, note, embedding) VALUES ($1, 'eski not', $3), ($2, 'yeni not', $3)`,
      [old.id, recent.id, zeroVector],
    );

    const deleted = await purgeOldQaLogs();

    expect(deleted).toBe(1);
    const questions = await query<{ question: string }>(
      "SELECT question FROM qa_log",
    );
    expect(questions.map((q) => q.question)).toEqual(["yeni soru"]);
    const notes = await query<{ note: string; qa_log_id: number | null }>(
      "SELECT note, qa_log_id FROM feedback ORDER BY note",
    );
    expect(notes).toEqual([
      { note: "eski not", qa_log_id: null },
      { note: "yeni not", qa_log_id: recent.id },
    ]);
  });
});

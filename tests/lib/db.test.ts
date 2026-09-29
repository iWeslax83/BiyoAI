import { describe, it, expect } from "vitest";
import { query } from "../../lib/db";

describe("db", () => {
  it("connects and queries", async () => {
    const rows = await query<{ answer: number }>("SELECT 1 + 1 AS answer");
    expect(rows[0].answer).toBe(2);
  });
});

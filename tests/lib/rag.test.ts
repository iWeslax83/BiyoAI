import { describe, it, expect, vi } from "vitest";

vi.mock("../../lib/retrieve", () => ({
  retrieveChunks: vi.fn(async () => [
    { id: 1, sourceId: 3, content: "Mitoz hücre bölünmesidir." },
  ]),
  retrieveFeedback: vi.fn(async () => []),
}));
vi.mock("../../lib/groq", () => ({
  chatComplete: vi.fn(async () => "Mitoz, [kaynak:3] hücrenin bölünmesidir."),
  embed: vi.fn(async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3])),
}));
const queryMock = vi.fn(
  async (sql: string, _params: unknown[]): Promise<unknown[]> => {
    if (sql.includes("SELECT title FROM sources"))
      return [{ title: "Test Kaynak" }];
    return [{ id: 42 }];
  },
);
vi.mock("../../lib/db", () => ({
  query: (sql: string, params: unknown[]) => queryMock(sql, params),
}));

import { answerQuestion } from "../../lib/rag";
import { retrieveChunks } from "../../lib/retrieve";
import { chatComplete } from "../../lib/groq";

describe("answerQuestion", () => {
  it("returns a grounded answer with cited source ids and logs it", async () => {
    const result = await answerQuestion("Mitoz nedir?");

    expect(result.grounded).toBe(true);
    expect(result.sourceIds).toEqual([3]);
    expect(result.sourceTitles).toEqual(["Test Kaynak"]);
    expect(result.answer).toContain("Mitoz");
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO qa_log"),
      expect.arrayContaining(["Mitoz nedir?"]),
    );
  });

  it("returns grounded=false with no source ids when the model cites nothing, but still logs the qa", async () => {
    vi.mocked(chatComplete).mockResolvedValueOnce(
      "Bu konuda elimde kaynak yok, bilmiyorum.",
    );
    queryMock.mockClear();

    const result = await answerQuestion("Bilinmeyen bir soru?");

    expect(result.grounded).toBe(false);
    expect(result.sourceIds).toEqual([]);
    expect(result.sourceTitles).toEqual([]);
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO qa_log"),
      expect.arrayContaining(["Bilinmeyen bir soru?"]),
    );
  });

  it("filters out fabricated citation ids that were never actually retrieved", async () => {
    vi.mocked(retrieveChunks).mockResolvedValueOnce([
      { id: 1, sourceId: 3, content: "Mitoz hücre bölünmesidir." },
    ]);
    vi.mocked(chatComplete).mockResolvedValueOnce(
      "Mitoz, [kaynak:3] hücrenin bölünmesidir. Ayrıca [kaynak:99] uydurma bir kaynak.",
    );

    const result = await answerQuestion("Mitoz nedir?");

    expect(result.sourceIds).toEqual([3]);
    expect(result.sourceIds).not.toContain(99);
    expect(result.grounded).toBe(true);
  });
});

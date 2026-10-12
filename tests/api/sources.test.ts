import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ isValidSession: () => true }));

const queryMock =
  vi.fn<(sql: string, params?: unknown[]) => Promise<unknown[]>>();
vi.mock("@/lib/db", () => ({
  query: (sql: string, params?: unknown[]) => queryMock(sql, params),
}));

const ingestMock = vi.fn<(id: number, text: string) => Promise<number>>();
vi.mock("@/lib/ingest", () => ({
  ingestSource: (id: number, text: string) => ingestMock(id, text),
}));

vi.mock("@/lib/pending", () => ({ kickPendingSources: vi.fn() }));

const fetchLinkMock =
  vi.fn<(url: string) => Promise<{ title: string; text: string }>>();
vi.mock("@/lib/fetch-link", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/fetch-link")>()),
  fetchLinkText: (url: string) => fetchLinkMock(url),
}));

const extractPdfMock = vi.fn<(data: Uint8Array) => Promise<string>>();
vi.mock("@/lib/pdf", () => ({
  extractPdfText: (data: Uint8Array) => extractPdfMock(data),
}));

import { GET, POST } from "../../app/api/sources/route";
import { LinkError } from "../../lib/fetch-link";
import { ProviderError } from "../../lib/provider-error";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/sources", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/sources (text)", () => {
  beforeEach(() => {
    queryMock.mockReset();
    ingestMock.mockReset();
    queryMock.mockImplementation(async (sql) =>
      sql.includes("INSERT INTO sources") ? [{ id: 9 }] : [],
    );
  });

  it("stores and ingests the source, then marks it ready", async () => {
    ingestMock.mockResolvedValue(4);

    const res = await POST(
      makeRequest({ title: "Hücre", kind: "text", text: "Hücre zarı" }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 9, chunkCount: 4, status: "ready" });
    expect(
      queryMock.mock.calls.some(([sql]) =>
        sql.includes("SET status = 'ready'"),
      ),
    ).toBe(true);
  });

  it("keeps the source as pending and answers 202 when ingest fails", async () => {
    ingestMock.mockRejectedValue(new Error("network down"));

    const res = await POST(
      makeRequest({ title: "Hücre", kind: "text", text: "Hücre zarı" }),
    );

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.status).toBe("pending");
    expect(body.id).toBe(9);
    expect(body.message).toContain("otomatik");
    expect(
      queryMock.mock.calls.some(([sql]) => sql.includes("DELETE FROM sources")),
    ).toBe(false);
  });

  it("marks the source failed and answers 422 when the provider rejects the content", async () => {
    ingestMock.mockRejectedValue(new ProviderError("input too long", "input"));

    const res = await POST(
      makeRequest({ title: "Hücre", kind: "text", text: "Hücre zarı" }),
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.status).toBe("failed");
    expect(body.error).toContain("input too long");
    expect(
      queryMock.mock.calls.some(([sql]) =>
        sql.includes("SET status = 'failed'"),
      ),
    ).toBe(true);
  });

  it("keeps the source pending and points at the settings when the provider is misconfigured", async () => {
    ingestMock.mockRejectedValue(new ProviderError("401 bad key", "config"));

    const res = await POST(
      makeRequest({ title: "Hücre", kind: "text", text: "Hücre zarı" }),
    );

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.status).toBe("pending");
    expect(body.message).toContain("ayar");
    expect(
      queryMock.mock.calls.some(([sql]) =>
        sql.includes("SET status = 'failed'"),
      ),
    ).toBe(false);
  });

  it("returns 400 when a required field is missing", async () => {
    const res = await POST(makeRequest({ title: "Hücre", kind: "text" }));
    expect(res.status).toBe(400);
  });
});

function insertedSource() {
  const call = queryMock.mock.calls.find(([sql]) =>
    sql.includes("INSERT INTO sources"),
  );
  return call?.[1] as [string, string, string] | undefined;
}

describe("POST /api/sources (link)", () => {
  beforeEach(() => {
    queryMock.mockReset();
    ingestMock.mockReset();
    fetchLinkMock.mockReset();
    queryMock.mockImplementation(async (sql) =>
      sql.includes("INSERT INTO sources") ? [{ id: 5 }] : [],
    );
    ingestMock.mockResolvedValue(2);
  });

  it("fetches the page and stores its text, using the page title", async () => {
    fetchLinkMock.mockResolvedValue({ title: "Mitoz", text: "Hücre bölünür." });

    const res = await POST(
      makeRequest({ kind: "link", url: "https://example.com/mitoz" }),
    );

    expect(res.status).toBe(200);
    expect(fetchLinkMock).toHaveBeenCalledWith("https://example.com/mitoz");
    expect(insertedSource()).toEqual(["Mitoz", "link", "Hücre bölünür."]);
  });

  it("uses the teacher's title over the page title when given", async () => {
    fetchLinkMock.mockResolvedValue({ title: "Mitoz", text: "Hücre bölünür." });

    await POST(
      makeRequest({
        kind: "link",
        url: "https://example.com/mitoz",
        title: "Benim başlığım",
      }),
    );

    expect(insertedSource()?.[0]).toBe("Benim başlığım");
  });

  it("returns 400 with the reason when the page cannot be fetched", async () => {
    fetchLinkMock.mockRejectedValue(
      new LinkError("Bu adrese erişim izni yok."),
    );

    const res = await POST(
      makeRequest({ kind: "link", url: "http://10.0.0.1/" }),
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Bu adrese erişim izni yok.");
    expect(insertedSource()).toBeUndefined();
  });

  it("returns 400 when the url is missing", async () => {
    const res = await POST(makeRequest({ kind: "link" }));
    expect(res.status).toBe(400);
  });
});

function pdfRequest(file: File | null, title?: string): NextRequest {
  const form = new FormData();
  if (file) form.set("file", file);
  if (title) form.set("title", title);
  return new NextRequest("http://localhost/api/sources", {
    method: "POST",
    body: form,
  });
}

describe("POST /api/sources (pdf)", () => {
  beforeEach(() => {
    queryMock.mockReset();
    ingestMock.mockReset();
    extractPdfMock.mockReset();
    queryMock.mockImplementation(async (sql) =>
      sql.includes("INSERT INTO sources") ? [{ id: 6 }] : [],
    );
    ingestMock.mockResolvedValue(3);
  });

  it("extracts the PDF text and stores it, titled after the file", async () => {
    extractPdfMock.mockResolvedValue("Mitokondri enerji üretir.");
    const file = new File(["%PDF-1.4"], "hucre-notlari.pdf", {
      type: "application/pdf",
    });

    const res = await POST(pdfRequest(file));

    expect(res.status).toBe(200);
    expect(insertedSource()).toEqual([
      "hucre-notlari.pdf",
      "pdf",
      "Mitokondri enerji üretir.",
    ]);
  });

  it("returns 422 when the PDF has no text layer", async () => {
    extractPdfMock.mockResolvedValue("");
    const file = new File(["%PDF-1.4"], "tarama.pdf", {
      type: "application/pdf",
    });

    const res = await POST(pdfRequest(file));

    expect(res.status).toBe(422);
    expect(insertedSource()).toBeUndefined();
  });

  it("returns 400 when the file is not a PDF", async () => {
    const file = new File(["merhaba"], "not.txt", { type: "text/plain" });
    const res = await POST(pdfRequest(file));
    expect(res.status).toBe(400);
  });

  it("returns 400 when no file was sent", async () => {
    const res = await POST(pdfRequest(null));
    expect(res.status).toBe(400);
  });

  it("returns 413 when the file is over 10 MB", async () => {
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "buyuk.pdf", {
      type: "application/pdf",
    });
    const res = await POST(pdfRequest(big));
    expect(res.status).toBe(413);
  });

  it("returns 400 when the PDF cannot be parsed", async () => {
    extractPdfMock.mockRejectedValue(new Error("Invalid PDF structure"));
    const file = new File(["bozuk"], "bozuk.pdf", { type: "application/pdf" });
    const res = await POST(pdfRequest(file));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/sources", () => {
  it("includes the provider status so the panel can show setup problems", async () => {
    queryMock.mockReset();
    queryMock.mockResolvedValue([]);

    const res = await GET(new NextRequest("http://localhost/api/sources"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider.embeddings).toEqual({ ok: true, error: null });
  });
});

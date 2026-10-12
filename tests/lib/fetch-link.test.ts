import { describe, it, expect } from "vitest";
import {
  LinkError,
  extractTitle,
  fetchLinkText,
  htmlToText,
  isPrivateAddress,
} from "../../lib/fetch-link";

const publicLookup = async () => ["93.184.216.34"];

function htmlResponse(body: string, init: ResponseInit = {}): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    ...init,
  });
}

describe("isPrivateAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "192.168.1.5",
    "172.16.0.1",
    "172.31.255.255",
    "169.254.169.254",
    "0.0.0.0",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:10.0.0.1",
  ])("treats %s as private", (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "93.184.216.34", "172.32.0.1", "2606:4700::1111"])(
    "treats %s as public",
    (ip) => {
      expect(isPrivateAddress(ip)).toBe(false);
    },
  );
});

describe("htmlToText", () => {
  it("drops scripts, styles and tags and decodes common entities", () => {
    const html =
      "<html><head><style>p{color:red}</style><script>alert(1)</script></head>" +
      "<body><h1>Hücre</h1><p>Zar &amp; sitoplazma&nbsp;vardır.</p></body></html>";
    const text = htmlToText(html);
    expect(text).toContain("Hücre");
    expect(text).toContain("Zar & sitoplazma vardır.");
    expect(text).not.toContain("alert");
    expect(text).not.toContain("color:red");
    expect(text).not.toContain("<");
  });
});

describe("extractTitle", () => {
  it("returns the trimmed page title", () => {
    expect(extractTitle("<title>\n Mitoz Bölünme </title>")).toBe(
      "Mitoz Bölünme",
    );
  });

  it("returns an empty string when there is no title", () => {
    expect(extractTitle("<p>x</p>")).toBe("");
  });
});

describe("fetchLinkText", () => {
  it("returns the page title and visible text", async () => {
    const result = await fetchLinkText("https://example.com/mitoz", {
      lookup: publicLookup,
      fetchImpl: async () =>
        htmlResponse("<title>Mitoz</title><p>Hücre bölünür.</p>"),
    });
    expect(result.title).toBe("Mitoz");
    expect(result.text).toContain("Hücre bölünür.");
  });

  it("rejects schemes other than http and https", async () => {
    await expect(
      fetchLinkText("file:///etc/passwd", { lookup: publicLookup }),
    ).rejects.toBeInstanceOf(LinkError);
    await expect(
      fetchLinkText("ftp://example.com/a", { lookup: publicLookup }),
    ).rejects.toBeInstanceOf(LinkError);
  });

  it("rejects a host that resolves to a private address", async () => {
    await expect(
      fetchLinkText("http://intranet.local/x", {
        lookup: async () => ["10.0.0.5"],
        fetchImpl: async () => htmlResponse("<p>secret</p>"),
      }),
    ).rejects.toBeInstanceOf(LinkError);
  });

  it("re-checks the target of a redirect", async () => {
    const lookup = async (host: string) =>
      host === "evil.example" ? ["169.254.169.254"] : ["93.184.216.34"];
    await expect(
      fetchLinkText("https://example.com/r", {
        lookup,
        fetchImpl: async () =>
          new Response(null, {
            status: 302,
            headers: { location: "http://evil.example/meta" },
          }),
      }),
    ).rejects.toBeInstanceOf(LinkError);
  });

  it("rejects non-text content types", async () => {
    await expect(
      fetchLinkText("https://example.com/a.zip", {
        lookup: publicLookup,
        fetchImpl: async () =>
          new Response("x", { headers: { "content-type": "application/zip" } }),
      }),
    ).rejects.toBeInstanceOf(LinkError);
  });

  it("rejects pages larger than the size limit", async () => {
    await expect(
      fetchLinkText("https://example.com/big", {
        lookup: publicLookup,
        fetchImpl: async () => htmlResponse("a".repeat(2 * 1024 * 1024 + 1)),
      }),
    ).rejects.toBeInstanceOf(LinkError);
  });

  it("rejects pages with no readable text", async () => {
    await expect(
      fetchLinkText("https://example.com/empty", {
        lookup: publicLookup,
        fetchImpl: async () => htmlResponse("<script>x()</script>"),
      }),
    ).rejects.toBeInstanceOf(LinkError);
  });
});

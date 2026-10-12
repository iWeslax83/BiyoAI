import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

// Fetches a web page the teacher pasted as a source and reduces it to text.
// The server runs on the school network, so this is guarded against being
// pointed at internal addresses (SSRF): every hop, including redirects, must
// resolve to a public address.

export class LinkError extends Error {}

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 10_000;

type Lookup = (hostname: string) => Promise<string[]>;
type Deps = { fetchImpl?: typeof fetch; lookup?: Lookup };

const defaultLookup: Lookup = async (hostname) =>
  (await dnsLookup(hostname, { all: true })).map((a) => a.address);

export function isPrivateAddress(ip: string): boolean {
  const lower = ip.toLowerCase();
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  const addr = mapped ? mapped[1] : lower;
  const version = isIP(addr);

  if (version === 4) {
    const [a, b] = addr.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  if (version === 6) {
    return (
      addr === "::" ||
      addr === "::1" ||
      addr.startsWith("::ffff:") ||
      /^f[cd]/.test(addr) ||
      /^fe[89ab]/.test(addr)
    );
  }
  // Not an IP at all: refuse rather than guess.
  return true;
}

function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCodePoint(parseInt(n, 16)),
    )
    .replace(/&([a-z]+);/gi, (m, name) => named[name.toLowerCase()] ?? m);
}

export function htmlToText(html: string): string {
  const withoutBlocks = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " ");
  const withBreaks = withoutBlocks.replace(
    /<\/(p|div|li|tr|h[1-6]|section|article|table)>|<br\s*\/?>/gi,
    "\n",
  );
  const stripped = withBreaks.replace(/<[^>]*>/g, " ");
  return decodeEntities(stripped)
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeEntities(match[1]).replace(/\s+/g, " ").trim() : "";
}

function parseUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new LinkError("Geçerli bir bağlantı gir (https://...).");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new LinkError("Sadece http ve https bağlantıları desteklenir.");
  }
  if (url.username || url.password) {
    throw new LinkError("Kullanıcı adı/şifre içeren bağlantılar desteklenmez.");
  }
  return url;
}

async function assertPublicHost(url: URL, lookup: Lookup): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let addresses: string[];
  try {
    addresses = isIP(host) ? [host] : await lookup(host);
  } catch {
    throw new LinkError(
      "Sayfaya ulaşılamadı. Bağlantıyı ve interneti kontrol et.",
    );
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new LinkError("Bu adrese erişim izni yok.");
  }
}

async function readLimited(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new LinkError("Sayfa çok büyük (en fazla 2 MB).");
    }
    parts.push(value);
  }
  const charset = /charset=([\w-]+)/i.exec(
    res.headers.get("content-type") ?? "",
  )?.[1];
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(charset ?? "utf-8");
  } catch {
    decoder = new TextDecoder("utf-8");
  }
  return decoder.decode(Buffer.concat(parts));
}

export async function fetchLinkText(
  rawUrl: string,
  deps: Deps = {},
): Promise<{ title: string; text: string }> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const lookup = deps.lookup ?? defaultLookup;

  let current = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = parseUrl(current);
    await assertPublicHost(url, lookup);

    let res: Response;
    try {
      res = await fetchImpl(url.href, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "user-agent": "BiyoAI/1.0", accept: "text/html,text/plain" },
      });
    } catch {
      throw new LinkError(
        "Sayfaya ulaşılamadı. Bağlantıyı ve interneti kontrol et.",
      );
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new LinkError("Sayfa yönlendirmesi okunamadı.");
      current = new URL(location, url).href;
      continue;
    }
    if (!res.ok) {
      throw new LinkError(`Sayfa açılamadı (HTTP ${res.status}).`);
    }

    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    if (
      !contentType.includes("text/html") &&
      !contentType.includes("text/plain")
    ) {
      throw new LinkError("Sadece web sayfaları ve düz metin desteklenir.");
    }

    const body = await readLimited(res);
    const isHtml = contentType.includes("text/html");
    const text = isHtml ? htmlToText(body) : body.trim();
    if (!text) {
      throw new LinkError("Sayfada okunabilir metin bulunamadı.");
    }
    return { title: isHtml ? extractTitle(body) : "", text };
  }
  throw new LinkError("Çok fazla yönlendirme.");
}

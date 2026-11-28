import type { MediaItem, ResolveResult } from "./types";

export interface ParsedTikTokUrl {
  canonicalUrl: string;
  videoId: string;
  isShortLink: boolean;
}

const ALLOWED_TIKTOK_HOSTS = new Set([
  "tiktok.com",
  "www.tiktok.com",
  "m.tiktok.com",
  "vm.tiktok.com",
  "vt.tiktok.com",
]);

const ALLOWED_TIKTOK_CDN_SUFFIXES = [
  ".tiktokcdn.com",
  ".tiktokcdn-us.com",
  ".tiktokcdn-eu.com",
  ".tiktokv.com",
  ".muscdn.com",
  ".byteoversea.com",
  ".ibytedtos.com",
  ".tikwm.com",
];

/**
 * Checks whether a URL belongs to an allowed TikTok web host.
 */
export function isTikTokPageUrl(rawInput: string): boolean {
  const trimmed = rawInput.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    return parsed.protocol === "https:" && ALLOWED_TIKTOK_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Validates and normalizes a TikTok video or short share URL.
 */
export function parseTikTokUrl(rawInput: string): ParsedTikTokUrl | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_TIKTOK_HOSTS.has(host)) {
    return null;
  }

  if (host === "vm.tiktok.com" || host === "vt.tiktok.com") {
    const shortCode = parsed.pathname.replace(/^\/+|\/+$/g, "");
    if (!/^[A-Za-z0-9_-]{5,32}$/.test(shortCode)) {
      return null;
    }
    return {
      canonicalUrl: `https://${host}/${shortCode}/`,
      videoId: shortCode,
      isShortLink: true,
    };
  }

  const fullMatch = parsed.pathname.match(/^\/@([A-Za-z0-9._]+)\/video\/([0-9]{6,30})\/?$/);
  if (fullMatch) {
    return {
      canonicalUrl: `https://www.tiktok.com/@${fullMatch[1]}/video/${fullMatch[2]}`,
      videoId: fullMatch[2],
      isShortLink: false,
    };
  }

  const mobileMatch = parsed.pathname.match(/^\/v\/([0-9]{6,30})(?:\.html)?\/?$/);
  if (mobileMatch) {
    return {
      canonicalUrl: `https://www.tiktok.com/video/${mobileMatch[1]}`,
      videoId: mobileMatch[1],
      isShortLink: false,
    };
  }

  return null;
}

/**
 * Ensures download proxy requests only fetch from official/verified TikTok CDN hosts.
 */
export function isAllowedTikTokCdnUrl(rawUrl: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  const isAllowed = ALLOWED_TIKTOK_CDN_SUFFIXES.some(
    (suffix) => host.endsWith(suffix) && host.length > suffix.length
  );

  return isAllowed ? parsed : null;
}

/**
 * Resolves vm.tiktok.com / vt.tiktok.com short links to canonical www.tiktok.com URLs
 * without following arbitrary non-TikTok redirects.
 */
async function expandShortTikTokUrl(target: ParsedTikTokUrl): Promise<ParsedTikTokUrl> {
  if (!target.isShortLink) {
    return target;
  }

  const response = await fetch(target.canonicalUrl, {
    method: "HEAD",
    redirect: "manual",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(8000),
  });

  const location = response.headers.get("location");
  if (location) {
    const reparsed = parseTikTokUrl(location);
    if (reparsed && !reparsed.isShortLink) {
      return reparsed;
    }
  }

  return target;
}

/**
 * Uses an optional configured RapidAPI TikTok no-watermark provider when a key is present.
 */
export async function resolveTikTokViaUpstreamApi(
  target: ParsedTikTokUrl,
  apiKey: string,
  apiHost: string,
  endpoint: string
): Promise<ResolveResult | null> {
  const expanded = await expandShortTikTokUrl(target);
  const url = new URL(endpoint);
  url.searchParams.set("url", expanded.canonicalUrl);
  url.searchParams.set("hd", "1");

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "x-rapidapi-key": apiKey,
      "x-rapidapi-host": apiHost,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const data =
    payload.data && typeof payload.data === "object"
      ? (payload.data as Record<string, unknown>)
      : payload;

  const items: MediaItem[] = [];
  const cover =
    typeof data.cover === "string"
      ? data.cover
      : typeof data.origin_cover === "string"
        ? data.origin_cover
        : undefined;

  const pushVideo = (raw: unknown, label: string, idSuffix: string) => {
    if (typeof raw === "string" && isAllowedTikTokCdnUrl(raw)) {
      items.push({
        id: `${expanded.videoId}-${idSuffix}`,
        type: "video",
        url: raw,
        thumbnail: cover,
        label,
        watermarkFree: true,
      });
    }
  };

  pushVideo(data.hdplay, "HD Video (No Watermark)", "hd");
  if (data.play !== data.hdplay) {
    pushVideo(data.play, "MP4 Video (No Watermark)", "sd");
  }

  if (typeof data.music === "string" && isAllowedTikTokCdnUrl(data.music)) {
    items.push({
      id: `${expanded.videoId}-audio`,
      type: "audio",
      url: data.music,
      thumbnail: cover,
      label: "Original Audio (MP3)",
      watermarkFree: true,
    });
  }

  if (items.length === 0) {
    return null;
  }

  const authorObj =
    data.author && typeof data.author === "object"
      ? (data.author as Record<string, unknown>)
      : null;

  return {
    platform: "tiktok",
    shortcode: expanded.videoId,
    canonicalUrl: expanded.canonicalUrl,
    kind: "tiktok",
    title:
      typeof data.title === "string" && data.title.trim()
        ? data.title.trim()
        : `TikTok Video (${expanded.videoId})`,
    author:
      authorObj && typeof authorObj.unique_id === "string"
        ? `@${authorObj.unique_id}`
        : undefined,
    caption: typeof data.title === "string" ? data.title : undefined,
    source: "upstream-api",
    items,
  };
}

function unescapeTikTokJsonUrl(raw: string): string {
  return raw
    .replace(/\\u002F/gi, "/")
    .replace(/\\u0026/gi, "&")
    .replace(/\\\//g, "/");
}

/**
 * Attempts to read public TikTok oEmbed + publicly exposed page metadata.
 * Does not bypass CAPTCHAs, login walls, or anti-bot challenges.
 */
export async function resolveTikTokPublicMetadata(
  target: ParsedTikTokUrl
): Promise<
  | { ok: true; data: ResolveResult }
  | { ok: false; status: number; code: string; message: string }
> {
  const expanded = await expandShortTikTokUrl(target);

  let oembedTitle: string | undefined;
  let oembedAuthor: string | undefined;
  let oembedThumb: string | undefined;

  try {
    const oembedUrl = new URL("https://www.tiktok.com/oembed");
    oembedUrl.searchParams.set("url", expanded.canonicalUrl);
    const oembedRes = await fetch(oembedUrl.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (oembedRes.ok) {
      const oembedJson = (await oembedRes.json()) as Record<string, unknown>;
      if (typeof oembedJson.title === "string") oembedTitle = oembedJson.title;
      if (typeof oembedJson.author_unique_id === "string") {
        oembedAuthor = `@${oembedJson.author_unique_id}`;
      }
      if (typeof oembedJson.thumbnail_url === "string") {
        oembedThumb = oembedJson.thumbnail_url;
      }
    }
  } catch {
    // Continue to page metadata inspection.
  }

  const pageRes = await fetch(expanded.canonicalUrl, {
    method: "GET",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (pageRes.status === 429) {
    return {
      ok: false,
      status: 429,
      code: "RATE_LIMITED",
      message:
        "TikTok rate-limited this request. Configure TIKTOK_RAPIDAPI_KEY in Worker Secrets for reliable no-watermark downloads.",
    };
  }

  if (!pageRes.ok) {
    return {
      ok: false,
      status: pageRes.status === 404 ? 404 : 422,
      code: pageRes.status === 404 ? "NOT_FOUND" : "MEDIA_UNAVAILABLE",
      message:
        "Could not fetch TikTok video metadata. Configure TIKTOK_RAPIDAPI_KEY in Worker Secrets for reliable no-watermark downloads.",
    };
  }

  const html = await pageRes.text();
  if (/captcha|verify|security check/i.test(html) && !html.includes("playAddr")) {
    return {
      ok: false,
      status: 422,
      code: "BOT_CHALLENGE",
      message:
        "TikTok presented an anti-bot verification on this edge IP. Configure TIKTOK_RAPIDAPI_KEY in Cloudflare Worker Secrets for no-watermark API extraction.",
    };
  }

  const items: MediaItem[] = [];
  const seen = new Set<string>();
  const playMatches = html.matchAll(/"playAddr"\s*:\s*"(https:[^"]+)"/g);
  for (const match of playMatches) {
    const candidate = unescapeTikTokJsonUrl(match[1]);
    if (!seen.has(candidate) && isAllowedTikTokCdnUrl(candidate)) {
      seen.add(candidate);
      items.push({
        id: `${expanded.videoId}-nowm-${items.length + 1}`,
        type: "video",
        url: candidate,
        thumbnail: oembedThumb,
        label:
          items.length === 0
            ? "MP4 Video (No Watermark)"
            : `MP4 Mirror #${items.length + 1} (No Watermark)`,
        watermarkFree: true,
      });
    }
  }

  if (items.length === 0) {
    return {
      ok: false,
      status: 422,
      code: "NO_WATERMARK_API_NEEDED",
      message:
        "TikTok did not expose a direct no-watermark video stream in public HTML for this edge request. Add TIKTOK_RAPIDAPI_KEY in Worker Secrets to enable full TikTok No-Watermark extraction.",
    };
  }

  return {
    ok: true,
    data: {
      platform: "tiktok",
      shortcode: expanded.videoId,
      canonicalUrl: expanded.canonicalUrl,
      kind: "tiktok",
      title: oembedTitle || `TikTok Video (${expanded.videoId})`,
      author: oembedAuthor,
      caption: oembedTitle,
      source: "public-metadata",
      items,
    },
  };
}

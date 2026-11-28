import type { MediaItem, ResolveResult } from "./types";

export interface ParsedSnapchatUrl {
  canonicalUrl: string;
  snapId: string;
  kind: "snap-spotlight" | "snap-story";
}

const ALLOWED_SNAP_HOSTS = new Set([
  "snapchat.com",
  "www.snapchat.com",
  "story.snapchat.com",
  "t.snapchat.com",
]);

const ALLOWED_SNAP_CDN_SUFFIXES = [".sc-cdn.net", ".snapchat.com"];

export function isSnapchatPageUrl(rawInput: string): boolean {
  const trimmed = rawInput.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    return parsed.protocol === "https:" && ALLOWED_SNAP_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function parseSnapchatUrl(rawInput: string): ParsedSnapchatUrl | null {
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
  if (!ALLOWED_SNAP_HOSTS.has(host)) {
    return null;
  }

  if (host === "t.snapchat.com") {
    const code = parsed.pathname.replace(/^\/+|\/+$/g, "");
    if (!/^[A-Za-z0-9_-]{4,40}$/.test(code)) return null;
    return {
      canonicalUrl: `https://t.snapchat.com/${code}`,
      snapId: code,
      kind: "snap-spotlight",
    };
  }

  const spotlightMatch = parsed.pathname.match(/^\/spotlight\/([A-Za-z0-9_-]{5,60})\/?$/);
  if (spotlightMatch) {
    return {
      canonicalUrl: `https://www.snapchat.com/spotlight/${spotlightMatch[1]}`,
      snapId: spotlightMatch[1],
      kind: "snap-spotlight",
    };
  }

  const storyMatch = parsed.pathname.match(
    /^\/(?:add|s|p)\/([A-Za-z0-9._-]{2,50})(?:\/([A-Za-z0-9._-]{2,60}))?\/?$/
  );
  if (storyMatch) {
    return {
      canonicalUrl: `https://www.snapchat.com${parsed.pathname}`,
      snapId: storyMatch[2] ?? storyMatch[1],
      kind: "snap-story",
    };
  }

  return null;
}

export function isAllowedSnapchatCdnUrl(rawUrl: string): URL | null {
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
  const isAllowed = ALLOWED_SNAP_CDN_SUFFIXES.some(
    (suffix) => host.endsWith(suffix) && host.length > suffix.length
  );

  return isAllowed ? parsed : null;
}

function decodeHtml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/\\u0026/g, "&")
    .replace(/\\\//g, "/");
}

function extractMeta(html: string, propertyName: string): string | undefined {
  const escaped = propertyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match =
    html.match(
      new RegExp(
        `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`,
        "i"
      )
    ) ??
    html.match(
      new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`,
        "i"
      )
    );
  return match?.[1] ? decodeHtml(match[1]) : undefined;
}

export async function resolveSnapchatViaUpstreamApi(
  target: ParsedSnapchatUrl,
  apiKey: string,
  apiHost: string,
  endpoint: string
): Promise<ResolveResult | null> {
  const url = new URL(endpoint);
  url.searchParams.set("url", target.canonicalUrl);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "x-rapidapi-key": apiKey,
      "x-rapidapi-host": apiHost,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) return null;

  const payload = (await response.json()) as Record<string, unknown>;
  const items: MediaItem[] = [];
  const thumb = typeof payload.thumbnail === "string" ? payload.thumbnail : undefined;

  if (typeof payload.url === "string" && isAllowedSnapchatCdnUrl(payload.url)) {
    items.push({
      id: `${target.snapId}-1`,
      type: "video",
      url: payload.url,
      thumbnail: thumb,
      label: "Snapchat Video (MP4)",
    });
  }

  if (items.length === 0) return null;

  return {
    platform: "snapchat",
    shortcode: target.snapId,
    canonicalUrl: target.canonicalUrl,
    kind: target.kind,
    title:
      typeof payload.title === "string" && payload.title.trim()
        ? payload.title.trim()
        : `Snapchat (${target.snapId})`,
    source: "upstream-api",
    items,
  };
}

export async function resolveSnapchatPublicMetadata(
  target: ParsedSnapchatUrl
): Promise<
  | { ok: true; data: ResolveResult }
  | { ok: false; status: number; code: string; message: string }
> {
  const response = await fetch(target.canonicalUrl, {
    method: "GET",
    redirect: "follow",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (response.status === 429) {
    return {
      ok: false,
      status: 429,
      code: "RATE_LIMITED",
      message:
        "Snapchat rate-limited this request. Configure SNAPCHAT_RAPIDAPI_KEY in Worker Secrets for reliable extraction.",
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status === 404 ? 404 : 422,
      code: response.status === 404 ? "NOT_FOUND" : "MEDIA_UNAVAILABLE",
      message:
        "Could not reach public Snapchat metadata. Make sure the Spotlight or public Story link is valid.",
    };
  }

  const html = await response.text();
  const ogVideo = extractMeta(html, "og:video") ?? extractMeta(html, "og:video:secure_url");
  const ogImage = extractMeta(html, "og:image");
  const ogTitle = extractMeta(html, "og:title");
  const ogDesc = extractMeta(html, "og:description");

  const items: MediaItem[] = [];
  const seen = new Set<string>();

  const addCandidate = (candidate: string | undefined, type: "video" | "image", label: string) => {
    if (!candidate || seen.has(candidate) || !isAllowedSnapchatCdnUrl(candidate)) return;
    seen.add(candidate);
    items.push({
      id: `${target.snapId}-${items.length + 1}`,
      type,
      url: candidate,
      thumbnail: ogImage && isAllowedSnapchatCdnUrl(ogImage) ? ogImage : undefined,
      label,
    });
  };

  addCandidate(ogVideo, "video", "Snapchat Spotlight Video (MP4)");

  const contentUrlMatches = html.matchAll(/"contentUrl"\s*:\s*"(https:[^"]+)"/g);
  for (const match of contentUrlMatches) {
    const clean = decodeHtml(match[1]);
    addCandidate(clean, clean.includes(".mp4") ? "video" : "image", "Snapchat Media");
  }

  if (items.length === 0) {
    addCandidate(ogImage, "image", "Snapchat Story Preview Image");
  }

  if (items.length === 0) {
    return {
      ok: false,
      status: 422,
      code: "MEDIA_UNAVAILABLE",
      message:
        "No public downloadable Snapchat video/story stream was found in page metadata. Configure SNAPCHAT_RAPIDAPI_KEY for extended Snapchat support.",
    };
  }

  return {
    ok: true,
    data: {
      platform: "snapchat",
      shortcode: target.snapId,
      canonicalUrl: target.canonicalUrl,
      kind: target.kind,
      title:
        ogTitle ??
        `Snapchat ${target.kind === "snap-spotlight" ? "Spotlight" : "Story"} (${target.snapId})`,
      caption: ogDesc,
      source: "public-metadata",
      items,
    },
  };
}

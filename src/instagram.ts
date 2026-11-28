import type { MediaItem, ResolveResult } from "./types";

export interface ParsedInstagramUrl {
  canonicalUrl: string;
  shortcode: string;
  kind: "reel" | "post" | "tv" | "story";
}

const ALLOWED_IG_HOSTS = new Set([
  "instagram.com",
  "www.instagram.com",
  "m.instagram.com",
  "instagr.am",
  "www.instagr.am",
]);

const ALLOWED_MEDIA_HOST_SUFFIXES = [".cdninstagram.com", ".fbcdn.net"];

/**
 * Checks whether a URL belongs to an allowed Instagram web host.
 */
export function isInstagramPageUrl(rawInput: string): boolean {
  const trimmed = rawInput.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    return parsed.protocol === "https:" && ALLOWED_IG_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Validates and normalizes an Instagram URL for Reels, Posts, IGTV, or Stories.
 */
export function parseInstagramUrl(rawInput: string): ParsedInstagramUrl | null {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return null;
  }

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
  if (!ALLOWED_IG_HOSTS.has(host)) {
    return null;
  }

  const postMatch = parsed.pathname.match(
    /^(?:\/[A-Za-z0-9._]+)?\/(p|reel|reels|tv)\/([A-Za-z0-9_-]{5,40})\/?$/
  );
  if (postMatch) {
    const rawKind = postMatch[1];
    const shortcode = postMatch[2];
    const kind: ParsedInstagramUrl["kind"] =
      rawKind === "reel" || rawKind === "reels"
        ? "reel"
        : rawKind === "tv"
          ? "tv"
          : "post";
    const pathPrefix = kind === "reel" ? "reel" : kind === "tv" ? "tv" : "p";
    return {
      canonicalUrl: `https://www.instagram.com/${pathPrefix}/${shortcode}/`,
      shortcode,
      kind,
    };
  }

  const storyMatch = parsed.pathname.match(
    /^\/stories\/([A-Za-z0-9._]+)\/([0-9]{5,30})\/?$/
  );
  if (storyMatch) {
    return {
      canonicalUrl: `https://www.instagram.com/stories/${storyMatch[1]}/${storyMatch[2]}/`,
      shortcode: storyMatch[2],
      kind: "story",
    };
  }

  return null;
}

/**
 * Ensures download proxy requests only fetch from official Instagram/Meta CDN hosts.
 */
export function isAllowedMediaCdnUrl(rawUrl: string): URL | null {
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
  const isAllowed = ALLOWED_MEDIA_HOST_SUFFIXES.some(
    (suffix) => host.endsWith(suffix) && host.length > suffix.length
  );

  return isAllowed ? parsed : null;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/\\u0026/g, "&")
    .replace(/\\\//g, "/");
}

function extractMetaTag(html: string, propertyName: string): string | undefined {
  const escaped = propertyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`,
      "i"
    ),
  ];

  for (const regex of patterns) {
    const match = html.match(regex);
    if (match?.[1]) {
      return decodeHtmlEntities(match[1]);
    }
  }
  return undefined;
}

function extractJsonMediaUrls(html: string): {
  videos: string[];
  images: string[];
} {
  const videos = new Set<string>();
  const images = new Set<string>();

  const videoRegex = /"video_url"\s*:\s*"(https:[^"]+)"/g;
  for (const match of html.matchAll(videoRegex)) {
    const clean = decodeHtmlEntities(match[1]);
    if (isAllowedMediaCdnUrl(clean)) {
      videos.add(clean);
    }
  }

  const imageRegex = /"display_url"\s*:\s*"(https:[^"]+)"/g;
  for (const match of html.matchAll(imageRegex)) {
    const clean = decodeHtmlEntities(match[1]);
    if (isAllowedMediaCdnUrl(clean)) {
      images.add(clean);
    }
  }

  return {
    videos: [...videos],
    images: [...images],
  };
}

/**
 * Extracts media using an optional configured upstream API when RAPIDAPI_KEY is present.
 */
export async function resolveViaUpstreamApi(
  target: ParsedInstagramUrl,
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
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const items: MediaItem[] = [];

  const pushCandidate = (
    mediaUrl: unknown,
    type: "video" | "image",
    thumb: unknown,
    index: number
  ) => {
    if (typeof mediaUrl !== "string" || !isAllowedMediaCdnUrl(mediaUrl)) {
      return;
    }
    items.push({
      id: `${target.shortcode}-${index + 1}`,
      type,
      url: mediaUrl,
      thumbnail: typeof thumb === "string" ? thumb : undefined,
      label: type === "video" ? `HD Video #${index + 1}` : `Photo #${index + 1}`,
    });
  };

  if (Array.isArray(payload.medias)) {
    payload.medias.forEach((entry, idx) => {
      if (entry && typeof entry === "object") {
        const record = entry as Record<string, unknown>;
        const isVideo =
          record.type === "video" ||
          String(record.extension ?? "").toLowerCase() === "mp4";
        pushCandidate(
          record.url,
          isVideo ? "video" : "image",
          record.thumbnail ?? payload.thumbnail,
          idx
        );
      }
    });
  } else if (typeof payload.video_url === "string") {
    pushCandidate(payload.video_url, "video", payload.thumbnail_url, 0);
  } else if (typeof payload.display_url === "string") {
    pushCandidate(payload.display_url, "image", payload.display_url, 0);
  }

  if (items.length === 0) {
    return null;
  }

  return {
    platform: "instagram",
    shortcode: target.shortcode,
    canonicalUrl: target.canonicalUrl,
    kind: target.kind,
    title:
      typeof payload.title === "string" && payload.title.trim()
        ? payload.title.trim()
        : `Instagram ${target.kind.toUpperCase()} (${target.shortcode})`,
    author: typeof payload.author === "string" ? payload.author : undefined,
    caption: typeof payload.caption === "string" ? payload.caption : undefined,
    source: "upstream-api",
    items,
  };
}

/**
 * Attempts to read publicly exposed OpenGraph / embed metadata for public Instagram URLs.
 * Does not bypass login walls, private accounts, or bot challenges.
 */
export async function resolvePublicMetadata(
  target: ParsedInstagramUrl
): Promise<
  | { ok: true; data: ResolveResult }
  | { ok: false; status: number; code: string; message: string }
> {
  if (target.kind === "story") {
    return {
      ok: false,
      status: 422,
      code: "LOGIN_REQUIRED",
      message:
        "Instagram Stories require an authenticated session or a configured media API key (RAPIDAPI_KEY).",
    };
  }

  const candidates = [
    `https://www.instagram.com/p/${target.shortcode}/embed/captioned/`,
    target.canonicalUrl,
  ];

  let lastStatus = 0;
  for (const candidateUrl of candidates) {
    const response = await fetch(candidateUrl, {
      method: "GET",
      redirect: "manual",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(10000),
    });

    lastStatus = response.status;

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location") ?? "";
      if (location.includes("/accounts/login")) {
        return {
          ok: false,
          status: 422,
          code: "LOGIN_REQUIRED",
          message:
            "Instagram redirected this request to login. Public posts can be blocked on datacenter IPs; configure RAPIDAPI_KEY in Worker Secrets for reliable extraction.",
        };
      }
      continue;
    }

    if (response.status === 429) {
      return {
        ok: false,
        status: 429,
        code: "RATE_LIMITED",
        message:
          "Instagram temporarily rate-limited requests from this edge location. Try again shortly or configure RAPIDAPI_KEY.",
      };
    }

    if (!response.ok) {
      continue;
    }

    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (contentLength > 2_000_000) {
      continue;
    }

    const html = await response.text();
    const ogVideo =
      extractMetaTag(html, "og:video") ?? extractMetaTag(html, "og:video:secure_url");
    const ogImage = extractMetaTag(html, "og:image");
    const ogTitle = extractMetaTag(html, "og:title");
    const ogDescription = extractMetaTag(html, "og:description");
    const jsonMedia = extractJsonMediaUrls(html);

    const items: MediaItem[] = [];
    const seenUrls = new Set<string>();

    const addItem = (url: string | undefined, type: "video" | "image", thumb?: string) => {
      if (!url || seenUrls.has(url) || !isAllowedMediaCdnUrl(url)) {
        return;
      }
      seenUrls.add(url);
      items.push({
        id: `${target.shortcode}-${items.length + 1}`,
        type,
        url,
        thumbnail: thumb && isAllowedMediaCdnUrl(thumb) ? thumb : undefined,
        label:
          type === "video"
            ? `HD Video${items.length > 0 ? ` #${items.length + 1}` : ""}`
            : `Photo${items.length > 0 ? ` #${items.length + 1}` : ""}`,
      });
    };

    for (const videoUrl of jsonMedia.videos) {
      addItem(videoUrl, "video", ogImage);
    }
    addItem(ogVideo, "video", ogImage);

    for (const imageUrl of jsonMedia.images) {
      addItem(imageUrl, "image", imageUrl);
    }
    if (items.length === 0) {
      addItem(ogImage, "image", ogImage);
    }

    if (items.length > 0) {
      return {
        ok: true,
        data: {
          platform: "instagram",
          shortcode: target.shortcode,
          canonicalUrl: target.canonicalUrl,
          kind: target.kind,
          title: ogTitle ?? `Instagram ${target.kind.toUpperCase()} (${target.shortcode})`,
          caption: ogDescription,
          source: "public-metadata",
          items,
        },
      };
    }
  }

  return {
    ok: false,
    status: lastStatus === 404 ? 404 : 422,
    code: lastStatus === 404 ? "NOT_FOUND" : "MEDIA_UNAVAILABLE",
    message:
      lastStatus === 404
        ? "Post not found or deleted. Please check that the Instagram link is public and valid."
        : "Could not extract a direct media URL from public metadata (the post may be private or require an authenticated upstream API via RAPIDAPI_KEY).",
  };
}

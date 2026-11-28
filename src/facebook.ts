import type { MediaItem, ResolveResult } from "./types";

export interface ParsedFacebookUrl {
  canonicalUrl: string;
  videoId: string;
  kind: "fb-reel" | "fb-video";
}

const ALLOWED_FB_HOSTS = new Set([
  "facebook.com",
  "www.facebook.com",
  "m.facebook.com",
  "web.facebook.com",
  "fb.watch",
  "www.fb.watch",
]);

const ALLOWED_FB_CDN_SUFFIXES = [".fbcdn.net"];

export function isFacebookPageUrl(rawInput: string): boolean {
  const trimmed = rawInput.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    return parsed.protocol === "https:" && ALLOWED_FB_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function parseFacebookUrl(rawInput: string): ParsedFacebookUrl | null {
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
  if (!ALLOWED_FB_HOSTS.has(host)) {
    return null;
  }

  if (host === "fb.watch" || host === "www.fb.watch") {
    const code = parsed.pathname.replace(/^\/+|\/+$/g, "");
    if (!/^[A-Za-z0-9_-]{4,40}$/.test(code)) return null;
    return {
      canonicalUrl: `https://fb.watch/${code}/`,
      videoId: code,
      kind: "fb-video",
    };
  }

  const reelMatch = parsed.pathname.match(/^\/reel\/([A-Za-z0-9_-]{5,40})\/?$/);
  if (reelMatch) {
    return {
      canonicalUrl: `https://www.facebook.com/reel/${reelMatch[1]}/`,
      videoId: reelMatch[1],
      kind: "fb-reel",
    };
  }

  const watchId = parsed.searchParams.get("v");
  if (parsed.pathname.startsWith("/watch") && watchId && /^[0-9]{5,30}$/.test(watchId)) {
    return {
      canonicalUrl: `https://www.facebook.com/watch/?v=${watchId}`,
      videoId: watchId,
      kind: "fb-video",
    };
  }

  const videoMatch = parsed.pathname.match(
    /^\/(?:[^/]+\/videos|share\/[rv])\/([A-Za-z0-9_.-]{5,40})\/?$/
  );
  if (videoMatch) {
    const isReel = parsed.pathname.includes("/share/r/");
    return {
      canonicalUrl: `https://www.facebook.com${parsed.pathname}`,
      videoId: videoMatch[1],
      kind: isReel ? "fb-reel" : "fb-video",
    };
  }

  return null;
}

export function isAllowedFacebookCdnUrl(rawUrl: string): URL | null {
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
  const isAllowed = ALLOWED_FB_CDN_SUFFIXES.some(
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
    .replace(/\\u0025/g, "%")
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

export async function resolveFacebookViaUpstreamApi(
  target: ParsedFacebookUrl,
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

  if (typeof payload.hd === "string" && isAllowedFacebookCdnUrl(payload.hd)) {
    items.push({
      id: `${target.videoId}-hd`,
      type: "video",
      url: payload.hd,
      thumbnail: thumb,
      label: "HD Video (MP4)",
    });
  }
  if (
    typeof payload.sd === "string" &&
    payload.sd !== payload.hd &&
    isAllowedFacebookCdnUrl(payload.sd)
  ) {
    items.push({
      id: `${target.videoId}-sd`,
      type: "video",
      url: payload.sd,
      thumbnail: thumb,
      label: "SD Video (MP4)",
    });
  }

  if (items.length === 0) return null;

  return {
    platform: "facebook",
    shortcode: target.videoId,
    canonicalUrl: target.canonicalUrl,
    kind: target.kind,
    title:
      typeof payload.title === "string" && payload.title.trim()
        ? payload.title.trim()
        : `Facebook ${target.kind === "fb-reel" ? "Reel" : "Video"} (${target.videoId})`,
    source: "upstream-api",
    items,
  };
}

export async function resolveFacebookPublicMetadata(
  target: ParsedFacebookUrl
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
        "Facebook temporarily rate-limited requests from this edge IP. Configure FACEBOOK_RAPIDAPI_KEY in Worker Secrets for reliable extraction.",
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status === 404 ? 404 : 422,
      code: response.status === 404 ? "NOT_FOUND" : "MEDIA_UNAVAILABLE",
      message:
        "Could not fetch public Facebook metadata. Ensure the video/reel is public or configure FACEBOOK_RAPIDAPI_KEY.",
    };
  }

  const html = await response.text();
  if (html.includes("/login/") && !html.includes("og:video")) {
    return {
      ok: false,
      status: 422,
      code: "LOGIN_REQUIRED",
      message:
        "Facebook required login for this link. Only public posts/reels are accessible without FACEBOOK_RAPIDAPI_KEY.",
    };
  }

  const ogVideo = extractMeta(html, "og:video") ?? extractMeta(html, "og:video:url");
  const ogImage = extractMeta(html, "og:image");
  const ogTitle = extractMeta(html, "og:title");
  const ogDesc = extractMeta(html, "og:description");

  const items: MediaItem[] = [];
  const seen = new Set<string>();

  const addVideo = (candidate: string | undefined, label: string) => {
    if (!candidate || seen.has(candidate) || !isAllowedFacebookCdnUrl(candidate)) return;
    seen.add(candidate);
    items.push({
      id: `${target.videoId}-${items.length + 1}`,
      type: "video",
      url: candidate,
      thumbnail: ogImage && isAllowedFacebookCdnUrl(ogImage) ? ogImage : undefined,
      label,
    });
  };

  addVideo(ogVideo, "Facebook Video (MP4)");

  const hdMatch = html.match(/"browser_native_hd_url"\s*:\s*"(https:[^"]+)"/);
  if (hdMatch?.[1]) addVideo(decodeHtml(hdMatch[1]), "HD Video (MP4)");

  const sdMatch = html.match(/"browser_native_sd_url"\s*:\s*"(https:[^"]+)"/);
  if (sdMatch?.[1]) addVideo(decodeHtml(sdMatch[1]), "SD Video (MP4)");

  if (items.length === 0 && ogImage && isAllowedFacebookCdnUrl(ogImage)) {
    items.push({
      id: `${target.videoId}-thumb`,
      type: "image",
      url: ogImage,
      thumbnail: ogImage,
      label: "Facebook Post Preview Image",
    });
  }

  if (items.length === 0) {
    return {
      ok: false,
      status: 422,
      code: "MEDIA_UNAVAILABLE",
      message:
        "No public downloadable video stream was exposed in Facebook metadata. Configure FACEBOOK_RAPIDAPI_KEY in Worker Secrets for full Facebook Reels & Video extraction.",
    };
  }

  return {
    ok: true,
    data: {
      platform: "facebook",
      shortcode: target.videoId,
      canonicalUrl: target.canonicalUrl,
      kind: target.kind,
      title: ogTitle ?? `Facebook ${target.kind === "fb-reel" ? "Reel" : "Video"} (${target.videoId})`,
      caption: ogDesc,
      source: "public-metadata",
      items,
    },
  };
}

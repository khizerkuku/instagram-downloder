import type { Env } from "./env";
import {
  isAllowedFacebookCdnUrl,
  isFacebookPageUrl,
  parseFacebookUrl,
  resolveFacebookPublicMetadata,
  resolveFacebookViaUpstreamApi,
} from "./facebook";
import {
  isAllowedMediaCdnUrl,
  isInstagramPageUrl,
  parseInstagramUrl,
  resolvePublicMetadata,
  resolveViaUpstreamApi,
} from "./instagram";
import {
  isAllowedSnapchatCdnUrl,
  isSnapchatPageUrl,
  parseSnapchatUrl,
  resolveSnapchatPublicMetadata,
  resolveSnapchatViaUpstreamApi,
} from "./snapchat";
import {
  isAllowedTikTokCdnUrl,
  isTikTokPageUrl,
  parseTikTokUrl,
  resolveTikTokPublicMetadata,
  resolveTikTokViaUpstreamApi,
} from "./tiktok";
import type { ResolveResult } from "./types";

const DEFAULT_IG_RAPIDAPI_HOST =
  "instagram-downloader-download-instagram-videos-stories1.p.rapidapi.com";
const DEFAULT_IG_RAPIDAPI_ENDPOINT =
  "https://instagram-downloader-download-instagram-videos-stories1.p.rapidapi.com/get-info-rapidapi";

const DEFAULT_TT_RAPIDAPI_HOST = "tiktok-scraper7.p.rapidapi.com";
const DEFAULT_TT_RAPIDAPI_ENDPOINT = "https://tiktok-scraper7.p.rapidapi.com/";

const DEFAULT_FB_RAPIDAPI_HOST = "facebook-reel-and-video-downloader.p.rapidapi.com";
const DEFAULT_FB_RAPIDAPI_ENDPOINT =
  "https://facebook-reel-and-video-downloader.p.rapidapi.com/app/main.php";

const DEFAULT_SNAP_RAPIDAPI_HOST = "snapchat-video-downloader1.p.rapidapi.com";
const DEFAULT_SNAP_RAPIDAPI_ENDPOINT =
  "https://snapchat-video-downloader1.p.rapidapi.com/snapchat";

type PublicResolveResult =
  | { ok: true; data: ResolveResult }
  | { ok: false; status: number; code: string; message: string };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function sanitizeFilename(input: string, fallbackExt: string): string {
  const cleaned = input
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .slice(0, 80);
  if (!cleaned) {
    return `media-downloader.${fallbackExt}`;
  }
  return cleaned.includes(".") ? cleaned : `${cleaned}.${fallbackExt}`;
}

async function resolveWithFallback(
  platform: string,
  viewerMode: boolean,
  tryUpstream: (() => Promise<ResolveResult | null>) | null,
  tryPublic: () => Promise<PublicResolveResult>
): Promise<Response> {
  if (tryUpstream) {
    try {
      const upstream = await tryUpstream();
      if (upstream) {
        return jsonResponse(
          { ok: true, data: { ...upstream, viewerMode } },
          200
        );
      }
    } catch (error) {
      console.error(
        JSON.stringify({
          message: `${platform} upstream api failed`,
          error: error instanceof Error ? error.message : String(error),
        })
      );
    }
  }

  try {
    const publicResult = await tryPublic();
    if (!publicResult.ok) {
      return jsonResponse(
        { ok: false, code: publicResult.code, message: publicResult.message },
        publicResult.status
      );
    }
    return jsonResponse(
      { ok: true, data: { ...publicResult.data, viewerMode } },
      200
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        message: `${platform} public metadata failed`,
        error: error instanceof Error ? error.message : String(error),
      })
    );
    return jsonResponse(
      {
        ok: false,
        code: "FETCH_ERROR",
        message: `Could not reach ${platform} from the Worker. Please try again shortly.`,
      },
      502
    );
  }
}

async function handleResolve(request: Request, env: Env): Promise<Response> {
  const reqUrl = new URL(request.url);
  let targetUrl = reqUrl.searchParams.get("url") ?? "";
  let viewerMode = reqUrl.searchParams.get("mode") === "viewer";

  if (request.method === "POST") {
    try {
      const body = (await request.json()) as { url?: unknown; mode?: unknown };
      if (typeof body?.url === "string") {
        targetUrl = body.url;
      }
      if (body?.mode === "viewer") {
        viewerMode = true;
      }
    } catch {
      return jsonResponse(
        { ok: false, code: "INVALID_JSON", message: "Request body must be valid JSON." },
        400
      );
    }
  }

  if (isTikTokPageUrl(targetUrl)) {
    const parsed = parseTikTokUrl(targetUrl);
    if (!parsed) {
      return jsonResponse(
        {
          ok: false,
          code: "INVALID_URL",
          message:
            "Please enter a valid TikTok video URL (e.g. https://www.tiktok.com/@user/video/123... or https://vm.tiktok.com/...).",
        },
        400
      );
    }
    console.log(JSON.stringify({ message: "resolve tiktok", videoId: parsed.videoId, viewerMode }));
    const key = env.TIKTOK_RAPIDAPI_KEY ?? env.RAPIDAPI_KEY;
    return resolveWithFallback(
      "TikTok",
      viewerMode,
      key
        ? () =>
            resolveTikTokViaUpstreamApi(
              parsed,
              key,
              env.TIKTOK_RAPIDAPI_HOST ?? DEFAULT_TT_RAPIDAPI_HOST,
              env.TIKTOK_RAPIDAPI_ENDPOINT ?? DEFAULT_TT_RAPIDAPI_ENDPOINT
            )
        : null,
      () => resolveTikTokPublicMetadata(parsed)
    );
  }

  if (isInstagramPageUrl(targetUrl)) {
    const parsed = parseInstagramUrl(targetUrl);
    if (!parsed) {
      return jsonResponse(
        {
          ok: false,
          code: "INVALID_URL",
          message:
            "Please enter a valid public Instagram Reel, Post, IGTV, or Story link (e.g. https://www.instagram.com/reel/...).",
        },
        400
      );
    }
    console.log(
      JSON.stringify({ message: "resolve instagram", shortcode: parsed.shortcode, kind: parsed.kind, viewerMode })
    );
    const key = env.RAPIDAPI_KEY;
    return resolveWithFallback(
      "Instagram",
      viewerMode,
      key
        ? () =>
            resolveViaUpstreamApi(
              parsed,
              key,
              env.RAPIDAPI_HOST ?? DEFAULT_IG_RAPIDAPI_HOST,
              env.RAPIDAPI_ENDPOINT ?? DEFAULT_IG_RAPIDAPI_ENDPOINT
            )
        : null,
      () => resolvePublicMetadata(parsed)
    );
  }

  if (isFacebookPageUrl(targetUrl)) {
    const parsed = parseFacebookUrl(targetUrl);
    if (!parsed) {
      return jsonResponse(
        {
          ok: false,
          code: "INVALID_URL",
          message:
            "Please enter a valid public Facebook Video, Reel, or fb.watch link (e.g. https://www.facebook.com/reel/...).",
        },
        400
      );
    }
    console.log(
      JSON.stringify({ message: "resolve facebook", videoId: parsed.videoId, kind: parsed.kind, viewerMode })
    );
    const key = env.FACEBOOK_RAPIDAPI_KEY ?? env.RAPIDAPI_KEY;
    return resolveWithFallback(
      "Facebook",
      viewerMode,
      key
        ? () =>
            resolveFacebookViaUpstreamApi(
              parsed,
              key,
              env.FACEBOOK_RAPIDAPI_HOST ?? DEFAULT_FB_RAPIDAPI_HOST,
              env.FACEBOOK_RAPIDAPI_ENDPOINT ?? DEFAULT_FB_RAPIDAPI_ENDPOINT
            )
        : null,
      () => resolveFacebookPublicMetadata(parsed)
    );
  }

  if (isSnapchatPageUrl(targetUrl)) {
    const parsed = parseSnapchatUrl(targetUrl);
    if (!parsed) {
      return jsonResponse(
        {
          ok: false,
          code: "INVALID_URL",
          message:
            "Please enter a valid public Snapchat Spotlight or Story link (e.g. https://www.snapchat.com/spotlight/...).",
        },
        400
      );
    }
    console.log(
      JSON.stringify({ message: "resolve snapchat", snapId: parsed.snapId, kind: parsed.kind, viewerMode })
    );
    const key = env.SNAPCHAT_RAPIDAPI_KEY ?? env.RAPIDAPI_KEY;
    return resolveWithFallback(
      "Snapchat",
      viewerMode,
      key
        ? () =>
            resolveSnapchatViaUpstreamApi(
              parsed,
              key,
              env.SNAPCHAT_RAPIDAPI_HOST ?? DEFAULT_SNAP_RAPIDAPI_HOST,
              env.SNAPCHAT_RAPIDAPI_ENDPOINT ?? DEFAULT_SNAP_RAPIDAPI_ENDPOINT
            )
        : null,
      () => resolveSnapchatPublicMetadata(parsed)
    );
  }

  return jsonResponse(
    {
      ok: false,
      code: "INVALID_URL",
      message:
        "Please enter a valid public Instagram, Reels, TikTok, Facebook, or Snapchat link.",
    },
    400
  );
}

async function handleDownload(request: Request): Promise<Response> {
  const reqUrl = new URL(request.url);
  const rawMediaUrl = reqUrl.searchParams.get("url") ?? "";
  const mediaUrl =
    isAllowedMediaCdnUrl(rawMediaUrl) ??
    isAllowedTikTokCdnUrl(rawMediaUrl) ??
    isAllowedFacebookCdnUrl(rawMediaUrl) ??
    isAllowedSnapchatCdnUrl(rawMediaUrl);

  if (!mediaUrl) {
    return jsonResponse(
      {
        ok: false,
        code: "INVALID_MEDIA_URL",
        message:
          "Only verified Instagram, TikTok, Facebook, or Snapchat CDN HTTPS media URLs can be downloaded.",
      },
      400
    );
  }

  const upstream = await fetch(mediaUrl.toString(), {
    method: "GET",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(25000),
  });

  if (!upstream.ok || !upstream.body) {
    return jsonResponse(
      {
        ok: false,
        code: "UPSTREAM_DOWNLOAD_FAILED",
        message: `Media CDN returned HTTP ${upstream.status}. The link may have expired; please resolve the URL again.`,
      },
      502
    );
  }

  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
  const fallbackExt =
    contentType.includes("audio") || contentType.includes("mpeg")
      ? "mp3"
      : contentType.includes("video")
        ? "mp4"
        : contentType.includes("png")
          ? "png"
          : contentType.includes("webp")
            ? "webp"
            : "jpg";

  const requestedName = reqUrl.searchParams.get("filename") ?? "media-downloader";
  const safeFilename = sanitizeFilename(requestedName, fallbackExt);

  const headers = new Headers();
  headers.set("Content-Type", contentType);
  headers.set("Content-Disposition", `attachment; filename="${safeFilename}"`);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Cache-Control", "private, max-age=300");

  const contentLength = upstream.headers.get("content-length");
  if (contentLength) {
    headers.set("Content-Length", contentLength);
  }

  // Stream response body directly without buffering in Worker memory.
  return new Response(upstream.body, {
    status: 200,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      return jsonResponse({
        ok: true,
        service: "Instagram Downloader",
        platforms: ["instagram", "tiktok", "facebook", "snapchat"],
        viewerSupported: true,
        runtime: "cloudflare-workers",
        upstreamApiConfigured: Boolean(
          env.RAPIDAPI_KEY ||
            env.TIKTOK_RAPIDAPI_KEY ||
            env.FACEBOOK_RAPIDAPI_KEY ||
            env.SNAPCHAT_RAPIDAPI_KEY
        ),
      });
    }

    if (
      url.pathname === "/api/resolve" &&
      (request.method === "POST" || request.method === "GET")
    ) {
      return handleResolve(request, env);
    }

    if (url.pathname === "/api/download" && request.method === "GET") {
      return handleDownload(request);
    }

    if (url.pathname.startsWith("/api/")) {
      return jsonResponse(
        { ok: false, code: "NOT_FOUND", message: "API endpoint not found." },
        404
      );
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

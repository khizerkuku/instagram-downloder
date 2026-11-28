/// <reference types="@cloudflare/workers-types" />

/**
 * Runtime bindings and optional secret variables for the Multi-Platform Downloader & Viewer Worker.
 */
export interface Env {
  ASSETS: Fetcher;
  RAPIDAPI_KEY?: string;
  RAPIDAPI_HOST?: string;
  RAPIDAPI_ENDPOINT?: string;
  TIKTOK_RAPIDAPI_KEY?: string;
  TIKTOK_RAPIDAPI_HOST?: string;
  TIKTOK_RAPIDAPI_ENDPOINT?: string;
  FACEBOOK_RAPIDAPI_KEY?: string;
  FACEBOOK_RAPIDAPI_HOST?: string;
  FACEBOOK_RAPIDAPI_ENDPOINT?: string;
  SNAPCHAT_RAPIDAPI_KEY?: string;
  SNAPCHAT_RAPIDAPI_HOST?: string;
  SNAPCHAT_RAPIDAPI_ENDPOINT?: string;
}

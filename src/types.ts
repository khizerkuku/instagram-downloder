export type Platform = "instagram" | "tiktok" | "facebook" | "snapchat";

export interface MediaItem {
  id: string;
  type: "video" | "image" | "audio";
  url: string;
  thumbnail?: string;
  label: string;
  watermarkFree?: boolean;
}

export interface ResolveResult {
  platform: Platform;
  shortcode: string;
  canonicalUrl: string;
  kind:
    | "reel"
    | "post"
    | "tv"
    | "story"
    | "tiktok"
    | "fb-reel"
    | "fb-video"
    | "snap-spotlight"
    | "snap-story";
  title: string;
  author?: string;
  caption?: string;
  source: "upstream-api" | "public-metadata";
  viewerMode?: boolean;
  items: MediaItem[];
}

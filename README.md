# Instagram Downloader (Reels, TikTok No-Watermark, Facebook, Snapchat & Viewers on Cloudflare Workers)

A minimal, dark/light-mode **Social Media Downloader & Viewer** built for **Cloudflare Workers** and **Workers Static Assets**.

## Supported Resources

- **Instagram & Reels** — Public Reels, Photos, Carousels, and IGTV.
- **TikTok (No Watermark)** — HD/SD MP4 without watermark + MP3 audio (`tiktok.com`, `vm.tiktok.com`, `vt.tiktok.com`).
- **Facebook** — Public Facebook Videos, Reels, and `fb.watch` links.
- **Snapchat** — Public Spotlight clips and public Stories (`snapchat.com/spotlight/...`, `/add/...`, `t.snapchat.com`).
- **Public Media Viewers** — Inline Viewer mode to watch/inspect media, creator handle, and captions in-browser before saving.

## Worker API Endpoints (`src/`)

- `GET /api/health` — Returns Worker status, supported platforms, and secret configuration status.
- `POST /api/resolve` — Auto-detects Instagram, TikTok, Facebook, or Snapchat URLs and resolves public metadata or configured upstream APIs (`RAPIDAPI_KEY`, `TIKTOK_RAPIDAPI_KEY`, `FACEBOOK_RAPIDAPI_KEY`, `SNAPCHAT_RAPIDAPI_KEY`).
- `GET /api/download` — Streams verified CDN media directly with `Content-Disposition: attachment` without buffering in Worker memory.

## Local Development & Deployment

```bash
npm install --global cf
npm install
cf dev
```

Deploy to Cloudflare Workers:

```bash
cf auth login
cf deploy
```

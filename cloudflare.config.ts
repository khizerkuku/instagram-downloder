import { defineConfig } from "cf/config";

export default defineConfig({
  worker: {
    name: "instagram-downloader",
    compatibilityDate: "2026-11-27",
    compatibilityFlags: ["nodejs_compat"],
    entrypoint: "./src/index.ts",
    observability: {
      enabled: true,
    },
    assets: {
      binding: "ASSETS",
      htmlHandling: "auto-trailing-slash",
      notFoundHandling: "single-page-application",
      runWorkerFirst: ["/api/*"],
    },
  },
});

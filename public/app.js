const heroCard = document.getElementById("heroCard");
const heroHeading = document.getElementById("heroHeading");
const heroSubtitle = document.getElementById("heroSubtitle");
const form = document.getElementById("downloadForm");
const urlInput = document.getElementById("mediaUrlInput");
const clearBtn = document.getElementById("clearBtn");
const pasteBtn = document.getElementById("pasteBtn");
const submitBtn = document.getElementById("submitBtn");
const submitLabel = document.getElementById("submitLabel");
const helperHint = document.getElementById("helperHint");
const alertBox = document.getElementById("alertBox");

const resultSection = document.getElementById("resultSection");
const resultPlatformBadge = document.getElementById("resultPlatformBadge");
const resultKindBadge = document.getElementById("resultKindBadge");
const resultSourceBadge = document.getElementById("resultSourceBadge");
const resultTitle = document.getElementById("resultTitle");
const resultAuthor = document.getElementById("resultAuthor");
const resultCaption = document.getElementById("resultCaption");
const originalLink = document.getElementById("originalLink");
const mediaGrid = document.getElementById("mediaGrid");

const historySection = document.getElementById("historySection");
const historyList = document.getElementById("historyList");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");

const apiStatusDot = document.getElementById("apiStatusDot");
const apiStatusText = document.getElementById("apiStatusText");
const themeToggleBtn = document.getElementById("themeToggleBtn");
const themeIcon = document.getElementById("themeIcon");
const themeLabel = document.getElementById("themeLabel");

const HISTORY_KEY = "ig_tt_downloader_history_v1";
const THEME_KEY = "ig_tt_theme_v1";

let activeKind = "all";

const SUN_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';
const MOON_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';

function applyTheme(theme) {
  const normalized = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", normalized);
  if (themeIcon && themeLabel) {
    themeIcon.innerHTML = normalized === "dark" ? SUN_SVG : MOON_SVG;
    themeLabel.textContent = normalized === "dark" ? "Light" : "Dark";
  }
}

if (themeToggleBtn) {
  applyTheme(document.documentElement.getAttribute("data-theme") || "dark");
  themeToggleBtn.addEventListener("click", () => {
    const current =
      document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
    const next = current === "light" ? "dark" : "light";
    applyTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Ignore storage errors.
    }
  });
}

const KIND_CONFIG = {
  all: {
    heading: "Social Media Downloader & Viewer",
    subtitle:
      "Paste any public link from <strong>Instagram Reels</strong>, <strong>TikTok (No Watermark)</strong>, <strong>Facebook</strong>, or <strong>Snapchat</strong> to view or download in HD.",
    placeholder: "Paste Instagram, Reels, TikTok, Facebook, or Snapchat link...",
    hint: "Auto-detects <code>instagram.com</code>, <code>tiktok.com</code>, <code>facebook.com</code> &amp; <code>snapchat.com</code>",
    button: "Download",
  },
  reels: {
    heading: "Instagram & Reels Downloader",
    subtitle:
      "Paste any public Instagram <strong>Reels</strong>, Photo, Carousel, or IGTV link to save in original quality.",
    placeholder: "https://www.instagram.com/reel/...",
    hint: "Supports <code>instagram.com/reel/...</code>, <code>/p/...</code>, and <code>/tv/...</code>",
    button: "Download",
  },
  tiktok: {
    heading: "TikTok Downloader (No Watermark)",
    subtitle:
      "Save public TikTok videos in HD MP4 <strong>without watermark</strong> plus original MP3 audio.",
    placeholder: "https://www.tiktok.com/@username/video/...",
    hint: "Supports <code>tiktok.com</code>, <code>vm.tiktok.com</code>, and <code>vt.tiktok.com</code>",
    button: "Download",
  },
  facebook: {
    heading: "Facebook Video & Reels Downloader",
    subtitle:
      "Download public Facebook Videos, <strong>Reels</strong>, and <code>fb.watch</code> clips in HD or SD.",
    placeholder: "https://www.facebook.com/reel/... or https://fb.watch/...",
    hint: "Supports <code>facebook.com/reel/...</code>, <code>/watch/?v=...</code> &amp; <code>fb.watch/...</code>",
    button: "Download",
  },
  snapchat: {
    heading: "Snapchat Spotlight & Story Downloader",
    subtitle:
      "Fetch public Snapchat <strong>Spotlight</strong> videos and public creator <strong>Stories</strong>.",
    placeholder: "https://www.snapchat.com/spotlight/...",
    hint: "Supports <code>snapchat.com/spotlight/...</code>, <code>/add/...</code> &amp; <code>t.snapchat.com/...</code>",
    button: "Download",
  },
  viewer: {
    heading: "Public Media & Story Viewer",
    subtitle:
      "Inspect and watch public <strong>Instagram</strong>, <strong>TikTok</strong>, <strong>Facebook</strong>, or <strong>Snapchat</strong> links inline without immediate download.",
    placeholder: "Paste any public link to view video, photo & metadata...",
    hint: "Viewer mode inspects public media, creator handle, title &amp; caption inline",
    button: "View Media",
  },
};

function showAlert(message, type = "error") {
  alertBox.textContent = message;
  alertBox.className = type === "info" ? "alert info" : "alert";
  alertBox.classList.remove("hidden");
}

function hideAlert() {
  alertBox.classList.add("hidden");
}

function setLoading(loading) {
  submitBtn.disabled = loading;
  const spinner = submitBtn.querySelector(".spinner");
  const idleText = KIND_CONFIG[activeKind]?.button || "Download";
  submitLabel.textContent = loading ? "Fetching..." : idleText;
  spinner.classList.toggle("hidden", !loading);
}

function syncClearButton() {
  clearBtn.classList.toggle("hidden", urlInput.value.trim().length === 0);
}

function selectKind(kind) {
  activeKind = KIND_CONFIG[kind] ? kind : "all";
  const cfg = KIND_CONFIG[activeKind];

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    const isMatch = btn.dataset.kind === activeKind;
    btn.classList.toggle("active", isMatch);
    btn.setAttribute("aria-selected", isMatch ? "true" : "false");
  });

  document.querySelectorAll(".resource-card").forEach((card) => {
    card.classList.toggle("selected", card.dataset.selectKind === activeKind);
  });

  heroHeading.textContent = cfg.heading;
  heroSubtitle.innerHTML = cfg.subtitle;
  urlInput.placeholder = cfg.placeholder;
  helperHint.innerHTML = cfg.hint;
  if (!submitBtn.disabled) {
    submitLabel.textContent = cfg.button;
  }
}

function detectPlatform(raw) {
  const value = raw.trim();
  if (!value) return null;
  try {
    const parsed = new URL(value.startsWith("http") ? value : `https://${value}`);
    const host = parsed.hostname.toLowerCase();

    if (
      ["instagram.com", "www.instagram.com", "m.instagram.com", "instagr.am", "www.instagr.am"].includes(
        host
      ) &&
      /\/(p|reel|reels|tv|stories)\//.test(parsed.pathname)
    ) {
      return "instagram";
    }

    if (
      ["tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"].includes(
        host
      ) &&
      parsed.pathname.length > 1
    ) {
      return "tiktok";
    }

    if (
      ["facebook.com", "www.facebook.com", "m.facebook.com", "web.facebook.com", "fb.watch", "www.fb.watch"].includes(
        host
      ) &&
      (parsed.pathname.length > 1 || parsed.searchParams.has("v"))
    ) {
      return "facebook";
    }

    if (
      ["snapchat.com", "www.snapchat.com", "story.snapchat.com", "t.snapchat.com"].includes(host) &&
      parsed.pathname.length > 1
    ) {
      return "snapchat";
    }
  } catch {
    return null;
  }
  return null;
}

function getHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveToHistory(canonicalUrl, platform, kind) {
  const existing = getHistory().filter((item) => item.url !== canonicalUrl);
  const updated = [{ url: canonicalUrl, platform, kind }, ...existing].slice(0, 6);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage quota errors.
  }
  renderHistory();
}

function formatHistoryPrefix(platform, kind) {
  if (platform === "tiktok") return "TT No-WM";
  if (platform === "facebook") return "FB";
  if (platform === "snapchat") return "SNAP";
  return `IG ${(kind || "reel").toUpperCase()}`;
}

function renderHistory() {
  const items = getHistory();
  historyList.innerHTML = "";
  historySection.classList.toggle("hidden", items.length === 0);

  for (const item of items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "history-chip";
    const prefix = formatHistoryPrefix(item.platform, item.kind);
    const shortPath = item.url.replace(
      /^https?:\/\/(www\.)?(instagram|tiktok|facebook|snapchat)\.com/,
      ""
    );
    btn.textContent = `${prefix} • ${shortPath}`;
    btn.addEventListener("click", () => {
      urlInput.value = item.url;
      syncClearButton();
      form.requestSubmit();
    });
    historyList.appendChild(btn);
  }
}

function buildDownloadHref(item, shortcode, platform, isDemo) {
  if (isDemo) {
    return item.url;
  }
  const params = new URLSearchParams({
    url: item.url,
    filename: `${platform}-${shortcode}-${item.id}`,
  });
  return `/api/download?${params.toString()}`;
}

function renderResult(data, { isDemo = false } = {}) {
  const platformLabels = {
    instagram: "INSTAGRAM",
    tiktok: "TIKTOK",
    facebook: "FACEBOOK",
    snapchat: "SNAPCHAT",
  };

  resultPlatformBadge.textContent = platformLabels[data.platform] || "MEDIA";
  resultPlatformBadge.className = "kind-badge";

  if (data.viewerMode) {
    resultKindBadge.textContent = "VIEWER MODE";
  } else if (data.platform === "tiktok") {
    resultKindBadge.textContent = "NO WATERMARK";
  } else {
    resultKindBadge.textContent = (data.kind || "media").toUpperCase();
  }

  resultSourceBadge.textContent = isDemo
    ? "Sample Preview"
    : data.source === "upstream-api"
      ? "HD Upstream API"
      : "Public Metadata";

  resultTitle.textContent = data.title || "Media Preview";
  resultAuthor.textContent = data.author ? `Creator: ${data.author}` : "";
  resultAuthor.classList.toggle("hidden", !data.author);

  resultCaption.textContent = data.caption || "";
  resultCaption.classList.toggle("hidden", !data.caption);

  originalLink.href = data.canonicalUrl || "#";
  mediaGrid.innerHTML = "";

  for (const item of data.items) {
    const card = document.createElement("article");
    card.className = "media-card";

    const preview = document.createElement("div");
    preview.className = item.type === "audio" ? "media-preview audio-preview" : "media-preview";

    if (item.type === "video") {
      const video = document.createElement("video");
      video.controls = true;
      video.playsInline = true;
      video.preload = "metadata";
      if (item.thumbnail) {
        video.poster = item.thumbnail;
      }
      video.src = item.url;
      preview.appendChild(video);
    } else if (item.type === "audio") {
      const audio = document.createElement("audio");
      audio.controls = true;
      audio.src = item.url;
      preview.appendChild(audio);
    } else {
      const img = document.createElement("img");
      img.src = item.url;
      img.alt = item.label || "Media Preview";
      img.loading = "lazy";
      preview.appendChild(img);
    }

    const body = document.createElement("div");
    body.className = "media-body";

    const titleRow = document.createElement("div");
    titleRow.className = "media-title-row";

    const label = document.createElement("div");
    label.className = "media-label";
    label.textContent =
      item.label ||
      (item.type === "video" ? "HD Video" : item.type === "audio" ? "Audio MP3" : "Photo");

    titleRow.appendChild(label);
    if (item.watermarkFree) {
      const nowm = document.createElement("span");
      nowm.className = "nowm-pill";
      nowm.textContent = "No Watermark";
      titleRow.appendChild(nowm);
    }

    const actions = document.createElement("div");
    actions.className = "media-actions";

    const dlLink = document.createElement("a");
    dlLink.className = "download-item-btn";
    dlLink.href = buildDownloadHref(item, data.shortcode || "media", data.platform || "media", isDemo);
    dlLink.textContent = isDemo
      ? "Sample SVG"
      : item.type === "audio"
        ? "Save MP3"
        : item.type === "video"
          ? "Save Video"
          : "Save Photo";
    if (isDemo) {
      dlLink.setAttribute("download", `${data.platform || "sample"}-preview.svg`);
    }

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "copy-url-btn";
    copyBtn.textContent = "Copy URL";
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(item.url);
        copyBtn.textContent = "Copied!";
        setTimeout(() => {
          copyBtn.textContent = "Copy URL";
        }, 1500);
      } catch {
        copyBtn.textContent = "Failed";
      }
    });

    actions.append(dlLink, copyBtn);
    body.append(titleRow, actions);
    card.append(preview, body);
    mediaGrid.appendChild(card);
  }

  resultSection.classList.remove("hidden");
  resultSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function checkWorkerHealth() {
  if (window.location.protocol === "file:") {
    apiStatusText.textContent = "Static Preview (Run cf dev for API)";
    return;
  }
  try {
    const res = await fetch("/api/health");
    if (!res.ok) throw new Error("Unhealthy");
    const json = await res.json();
    if (json?.ok) {
      apiStatusDot.classList.add("online");
      apiStatusText.textContent = json.upstreamApiConfigured
        ? "All Resources API Ready"
        : "Cloudflare Worker Ready";
    }
  } catch {
    apiStatusText.textContent = "Static Mode (API Offline)";
  }
}

document.querySelectorAll(".tab-btn").forEach((tab) => {
  tab.addEventListener("click", () => {
    selectKind(tab.dataset.kind || "all");
  });
});

document.querySelectorAll(".resource-card").forEach((card) => {
  card.addEventListener("click", () => {
    const kind = card.dataset.selectKind || "all";
    selectKind(kind);
    heroCard.scrollIntoView({ behavior: "smooth", block: "start" });
    urlInput.focus();
  });
});

urlInput.addEventListener("input", () => {
  syncClearButton();
  hideAlert();
});

clearBtn.addEventListener("click", () => {
  urlInput.value = "";
  syncClearButton();
  hideAlert();
  urlInput.focus();
});

pasteBtn.addEventListener("click", async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      urlInput.value = text.trim();
      syncClearButton();
      hideAlert();
    }
  } catch {
    showAlert("Clipboard permission was denied. Please paste manually with Ctrl+V / Cmd+V.", "info");
  }
});

clearHistoryBtn.addEventListener("click", () => {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
});

function showDemoCard(mode) {
  hideAlert();
  const isViewer = mode === "viewer";
  const platform = isViewer ? "instagram" : mode;
  const isLight = document.documentElement.getAttribute("data-theme") === "light";

  const bgFill = isLight ? "#eef0f4" : "#161920";
  const borderStroke = isLight ? "rgba(17,24,39,0.12)" : "rgba(255,255,255,0.1)";
  const circleFill = isLight ? "#ffffff" : "#1d212a";
  const titleFill = isLight ? "#111827" : "#f3f4f6";
  const subFill = isLight ? "#4b5563" : "#9ca3af";

  const headingMap = {
    instagram: "Instagram & Reels",
    tiktok: "TikTok Downloader",
    facebook: "Facebook Downloader",
    snapchat: "Snapchat Downloader",
    viewer: "Public Media Viewer",
  };
  const subMap = {
    instagram: "Reels, Photos & Carousel",
    tiktok: "HD MP4 Without Watermark",
    facebook: "Facebook Videos & Reels",
    snapchat: "Spotlight & Public Stories",
    viewer: "Inline Preview & Metadata",
  };

  const svg =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">
        <rect width="800" height="1000" fill="${bgFill}"/>
        <rect x="36" y="36" width="728" height="928" rx="28" fill="none" stroke="${borderStroke}" stroke-width="2"/>
        <circle cx="400" cy="420" r="96" fill="${circleFill}" stroke="${borderStroke}" stroke-width="2"/>
        <path d="M400 370v96m0 0-36-36m36 36 36-36M340 498h120" stroke="${titleFill}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <text x="400" y="610" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="bold" fill="${titleFill}">${
          headingMap[mode] || "Media Preview"
        }</text>
        <text x="400" y="660" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" fill="${subFill}">${
          subMap[mode] || "Sample Preview"
        }</text>
      </svg>`
    );

  const kindMap = {
    instagram: "reel",
    tiktok: "tiktok",
    facebook: "fb-reel",
    snapchat: "snap-spotlight",
    viewer: "reel",
  };

  renderResult(
    {
      platform,
      shortcode: "sample",
      canonicalUrl:
        platform === "tiktok"
          ? "https://www.tiktok.com/"
          : platform === "facebook"
            ? "https://www.facebook.com/"
            : platform === "snapchat"
              ? "https://www.snapchat.com/"
              : "https://www.instagram.com/",
      kind: kindMap[mode] || "reel",
      viewerMode: isViewer,
      title: `${headingMap[mode] || "Media"} — Sample Preview`,
      author: platform === "tiktok" || platform === "snapchat" ? "@sample_creator" : undefined,
      caption: isViewer
        ? "Viewer Mode lets you inspect public media, creator handle, and captions inline before saving."
        : `Sample preview card for ${headingMap[mode]} powered by Cloudflare Workers.`,
      items: [
        {
          id: "sample-1",
          type: "image",
          url: svg,
          label:
            platform === "tiktok"
              ? "HD Video (No Watermark)"
              : isViewer
                ? "Inline Viewer Preview"
                : `${headingMap[mode]} HD Media`,
          watermarkFree: platform === "tiktok",
        },
      ],
    },
    { isDemo: true }
  );
}

document.querySelectorAll(".demo-trigger").forEach((btn) => {
  btn.addEventListener("click", () => {
    showDemoCard(btn.dataset.demo || "instagram");
  });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideAlert();

  const rawUrl = urlInput.value.trim();
  const detected = detectPlatform(rawUrl);
  if (!detected) {
    showAlert(
      "Please enter a valid public Instagram, Reels, TikTok, Facebook, or Snapchat link."
    );
    return;
  }

  if (window.location.protocol === "file:") {
    showAlert(
      "Backend API (/api/resolve) requires the Cloudflare Worker dev server (`cf dev`). Use the Preview links below to inspect the UI.",
      "info"
    );
    return;
  }

  setLoading(true);
  try {
    const response = await fetch("/api/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: rawUrl,
        mode: activeKind === "viewer" ? "viewer" : "download",
      }),
    });
    const payload = await response.json();

    if (!response.ok || !payload?.ok) {
      showAlert(
        payload?.message ||
          "Could not extract media from that link. Please verify the post or video is public."
      );
      return;
    }

    renderResult(payload.data);
    saveToHistory(payload.data.canonicalUrl, payload.data.platform, payload.data.kind);
  } catch {
    showAlert(
      "Could not reach the Cloudflare Worker backend (/api/resolve). Start the dev server with `cf dev` or deploy with `cf deploy`."
    );
  } finally {
    setLoading(false);
  }
});

renderHistory();
syncClearButton();
checkWorkerHealth();

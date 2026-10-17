import { ungzip } from "pako";
import { safeUrl } from "./record-utils.js";

// Keep the file-size cache scoped to this page.
const fileSizeCache = new Map();

export const fetchFileSizeBytes = async (url) => {
  if (!url || url === "#") return null;
  if (fileSizeCache.has(url)) return fileSizeCache.get(url);

  const FETCH_TIMEOUT_MS = 8000;
  const timedFetch = async (resource, init = {}) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      return await fetch(resource, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  };

  try {
    const headResponse = await timedFetch(url, {
      method: "HEAD",
      cache: "no-store",
    });
    const contentLength = headResponse.headers.get("content-length");
    const headSize = Number(contentLength);
    if (headResponse.ok && Number.isFinite(headSize) && headSize > 0) {
      fileSizeCache.set(url, headSize);
      return headSize;
    }
  } catch (error) {
    console.warn("HEAD size lookup failed:", error);
  }

  try {
    const rangeResponse = await timedFetch(url, {
      method: "GET",
      cache: "no-store",
      headers: { Range: "bytes=0-0" },
    });

    if (rangeResponse.ok || rangeResponse.status === 206) {
      const contentRange = rangeResponse.headers.get("content-range");
      const contentLength = rangeResponse.headers.get("content-length");

      if (contentRange) {
        const totalMatch = contentRange.match(/\/(\d+)$/);
        const totalSize = Number(totalMatch?.[1]);
        if (Number.isFinite(totalSize) && totalSize > 0) {
          fileSizeCache.set(url, totalSize);
          return totalSize;
        }
      }

      const fallbackSize = Number(contentLength);
      if (Number.isFinite(fallbackSize) && fallbackSize > 0) {
        fileSizeCache.set(url, fallbackSize);
        return fallbackSize;
      }
    }
  } catch (error) {
    console.warn("Range size lookup failed:", error);
  }

  return null;
};

const isGzipFileLink = (fileUrl, fileName = "") => {
  const fromUrl = /\.gz(?:$|[?#])/i.test(String(fileUrl || ""));
  const fromName = /\.gz$/i.test(String(fileName || ""));
  return fromUrl || fromName;
};

const getReconstructedMimeType = (fileName = "") => {
  const lower = String(fileName).toLowerCase().replace(/\.gz$/, "");
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
};

const decompressGzipToBlob = async (response, mimeType) => {
  if (!response.ok) {
    throw new Error(`Download failed (${response.status})`);
  }

  if (typeof DecompressionStream === "function" && response.body) {
    const decompressedStream = response.body.pipeThrough(
      new DecompressionStream("gzip"),
    );
    const decompressedBlob = await new Response(decompressedStream).blob();
    return new Blob([decompressedBlob], { type: mimeType });
  }

  const compressedBuffer = await response.arrayBuffer();
  const decompressedBytes = ungzip(new Uint8Array(compressedBuffer));
  return new Blob([decompressedBytes], { type: mimeType });
};

const setFileLinkLoading = (linkEl, loading) => {
  if (!(linkEl instanceof HTMLElement)) return;

  if (loading) {
    if (linkEl.dataset.loading === "true") return;
    linkEl.dataset.loading = "true";
    linkEl.dataset.originalLabel = linkEl.innerHTML;
    linkEl.dataset.originalWidth = linkEl.style.width || "";
    linkEl.dataset.originalHeight = linkEl.style.height || "";
    linkEl.style.width = `${linkEl.offsetWidth}px`;
    linkEl.style.height = `${linkEl.offsetHeight}px`;
    linkEl.classList.add("is-loading");
    linkEl.setAttribute("aria-busy", "true");
    linkEl.innerHTML =
      '<dotlottie-wc class="file-link-lottie" src="../assets/load.lottie" autoplay loop></dotlottie-wc>';
    return;
  }

  if (linkEl.dataset.loading !== "true") return;
  linkEl.classList.remove("is-loading");
  linkEl.removeAttribute("aria-busy");
  linkEl.innerHTML = linkEl.dataset.originalLabel || "Download";
  linkEl.style.width = linkEl.dataset.originalWidth || "";
  linkEl.style.height = linkEl.dataset.originalHeight || "";
  delete linkEl.dataset.loading;
  delete linkEl.dataset.originalLabel;
  delete linkEl.dataset.originalWidth;
  delete linkEl.dataset.originalHeight;
};

export const createFileOpener = ({ showToast, notifyCompressed = false }) => {
  const openStoredFile = async (fileUrl, fileName = "", triggerEl = null) => {
    const safeFileUrl = safeUrl(fileUrl);
    if (safeFileUrl === "#") {
      console.warn("[file-open] Invalid or unsupported file URL", {
        fileUrl,
        fileName,
      });
      showToast("This file link is invalid or missing.", "error", 3600);
      return;
    }

    setFileLinkLoading(triggerEl, true);

    // Open a tab synchronously within the click gesture so later async work
    // (gzip decompression) does not get blocked by popup protection.
    let openedTab = null;
    try {
      openedTab = window.open("", "_blank");
    } catch (error) {
      openedTab = null;
    }
    if (openedTab) {
      try {
        openedTab.opener = null;
      } catch (error) {
        // Keep the tab reference even if opener cannot be changed.
      }
    }

    try {
      const isCompressed = isGzipFileLink(safeFileUrl, fileName);
      console.info("[file-open] Opening file", {
        fileName,
        isCompressed,
        url: safeFileUrl,
      });

      // If compressed, reconstruct the original file before opening.
      if (isCompressed) {
        try {
          if (notifyCompressed) showToast("Opening compressed file...", "info", 1800);
          const response = await fetch(safeFileUrl, { cache: "no-store" });
          if (!response.ok) {
            throw new Error(`Download failed (${response.status})`);
          }
          const mimeType = getReconstructedMimeType(fileName);
          const rebuiltBlob = await decompressGzipToBlob(response, mimeType);

          const objectUrl = URL.createObjectURL(rebuiltBlob);

          if (openedTab && !openedTab.closed) {
            openedTab.location.href = objectUrl;
          } else {
            const fallbackTab = window.open(objectUrl, "_blank", "noopener");
            if (!fallbackTab) {
              window.location.assign(objectUrl);
            }
          }

          setTimeout(() => URL.revokeObjectURL(objectUrl), 60 * 1000);
          return;
        } catch (error) {
          console.error("[file-open] Failed to reconstruct compressed file", {
            url: safeFileUrl,
            fileName,
            error,
          });
          showToast(
            "Could not reconstruct compressed file. Opening original download.",
            "warning",
            3200,
          );
          // Fall through to opening the URL directly
        }
      }

      // For non-compressed files or when decompression not supported/failed:
      // Open the file URL in a new tab
      if (openedTab && !openedTab.closed) {
        openedTab.location.href = safeFileUrl;
      } else {
        const fallbackTab = window.open(safeFileUrl, "_blank", "noopener");
        if (!fallbackTab) {
          window.location.assign(safeFileUrl);
        }
      }
    } finally {
      setFileLinkLoading(triggerEl, false);
    }
  };
  return openStoredFile;
};

// Move the existing link so its download state and event handlers stay intact.
export const setupResponsiveViewDownload = (link) => {
  const originalParent = link.parentElement;
  const originalNext = link.nextSibling;
  const close = document.getElementById("close-view");
  const phone = window.matchMedia("(max-width: 768px)");
  const update = () => {
    link.classList.toggle("modal-btn", phone.matches);
    if (phone.matches) {
      close.before(link);
    } else {
      originalParent.insertBefore(link, originalNext);
    }
  };
  phone.addEventListener("change", update);
  update();
};

// Shared pure helpers for Records rendering and input formatting.

export const escapeHtml = (str) => {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
};

export const safeUrl = (url) => {
  if (!url) return "#";
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return url;
    }
  } catch (e) {}
  return "#";
};

export const formatFileSize = (bytes) => {
  if (!Number.isFinite(bytes) || bytes < 0) return "File size: -";
  if (bytes < 1024) return `File size: ${bytes} B`;
  if (bytes < 1024 * 1024) return `File size: ${(bytes / 1024).toFixed(1)} KB`;
  return `File size: ${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

export const formatFileLabel = (_value) => "Download";

export const formatTaNumber = (value) => {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  const part1 = digits.slice(0, 4);
  const part2 = digits.slice(4, 6);
  const part3 = digits.slice(6, 10);
  if (digits.length <= 4) return part1;
  if (digits.length <= 6) return `${part1}-${part2}`;
  return `${part1}-${part2}-${part3}`;
};

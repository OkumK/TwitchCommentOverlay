const DEFAULT_SETTINGS = {
  enabled: true,
  fontSize: 28,
  speed: 12,
  opacity: 95,
  maxRows: 12,
  verticalStart: 8,
  verticalEnd: 82,
  showUsernames: true
};

const CONTENT_RANGES = {
  fontSize: [16, 56],
  speed: [5, 24],
  opacity: [20, 100],
  maxRows: [1, 20],
  verticalStart: [0, 95],
  verticalEnd: [5, 100]
};

const POPUP_RANGES = {
  fontSize: [16, 56],
  speed: [5, 24],
  opacity: [20, 100],
  maxRows: [3, 20],
  verticalStart: [0, 60],
  verticalEnd: [40, 100]
};

const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeNumber(value, fallback, min, max) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return clamp(numericValue, min, max);
}

function normalizeBoolean(value, fallback) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalizedValue = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalizedValue)) {
      return true;
    }
    if (["false", "0", "no", "off", ""].includes(normalizedValue)) {
      return false;
    }
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  return fallback;
}

function normalizeSettings(rawSettings) {
  const source = rawSettings || {};
  const next = { ...DEFAULT_SETTINGS };
  for (const key of SETTING_KEYS) {
    if (Object.hasOwn(source, key)) {
      next[key] = source[key];
    }
  }

  next.fontSize = normalizeNumber(next.fontSize, DEFAULT_SETTINGS.fontSize, ...CONTENT_RANGES.fontSize);
  next.speed = normalizeNumber(next.speed, DEFAULT_SETTINGS.speed, ...CONTENT_RANGES.speed);
  next.opacity = normalizeNumber(next.opacity, DEFAULT_SETTINGS.opacity, ...CONTENT_RANGES.opacity);
  next.maxRows = normalizeNumber(next.maxRows, DEFAULT_SETTINGS.maxRows, ...CONTENT_RANGES.maxRows);
  next.verticalStart = normalizeNumber(next.verticalStart, DEFAULT_SETTINGS.verticalStart, ...CONTENT_RANGES.verticalStart);
  next.verticalEnd = normalizeNumber(next.verticalEnd, DEFAULT_SETTINGS.verticalEnd, ...CONTENT_RANGES.verticalEnd);

  if (next.verticalStart >= next.verticalEnd) {
    next.verticalEnd = clamp(next.verticalStart + 10, ...CONTENT_RANGES.verticalEnd);
    if (next.verticalStart >= next.verticalEnd) {
      next.verticalStart = Math.max(CONTENT_RANGES.verticalStart[0], next.verticalEnd - 10);
    }
  }

  next.showUsernames = normalizeBoolean(next.showUsernames, DEFAULT_SETTINGS.showUsernames);
  next.enabled = normalizeBoolean(next.enabled, DEFAULT_SETTINGS.enabled);
  return next;
}

const exported = {
  DEFAULT_SETTINGS,
  POPUP_RANGES,
  SETTING_KEYS,
  clamp,
  normalizeSettings
};

if (typeof globalThis !== "undefined") {
  globalThis.TCO_SETTINGS = exported;
}

if (typeof module !== "undefined") {
  module.exports = exported;
}

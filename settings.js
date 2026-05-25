(() => {
  const DEFAULT_SETTINGS = {
    enabled: true,
    fontSize: 25,
    speed: 10,
    opacity: 80,
    maxRows: 12,
    verticalStart: 20,
    verticalEnd: 80,
    showUsernames: true,
    showBadges: false,
    showEmotes: true,
    hideSubscriptions: true,
    hideCheers: true
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
    verticalStart: [0, 90],
    verticalEnd: [10, 100]
  };

  const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS);

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

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
      if (hasOwn(source, key)) {
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
    next.showBadges = normalizeBoolean(next.showBadges, DEFAULT_SETTINGS.showBadges);
    next.showEmotes = normalizeBoolean(next.showEmotes, DEFAULT_SETTINGS.showEmotes);
    next.hideSubscriptions = normalizeBoolean(next.hideSubscriptions, DEFAULT_SETTINGS.hideSubscriptions);
    next.hideCheers = normalizeBoolean(next.hideCheers, DEFAULT_SETTINGS.hideCheers);
    next.enabled = normalizeBoolean(next.enabled, DEFAULT_SETTINGS.enabled);
    return next;
  }

  const exported = {
    DEFAULT_SETTINGS,
    POPUP_RANGES,
    SETTING_KEYS,
    clamp,
    hasOwn,
    normalizeSettings
  };

  if (typeof globalThis !== "undefined") {
    globalThis.TCO_SETTINGS = exported;
  }

  if (typeof module !== "undefined") {
    module.exports = exported;
  }
})();

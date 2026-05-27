const {
  DEFAULT_SETTINGS,
  POPUP_RANGES,
  SETTING_KEYS,
  applyLocalizedContent,
  clamp,
  getLocalizedStrings,
  normalizeLanguage,
  normalizeSettings
} = globalThis.TCO_SETTINGS;

const controls = {
  enabled: document.querySelector("#enabled"),
  language: document.querySelector("#language"),
  displayMode: document.querySelector("#displayMode"),
  fontSize: document.querySelector("#fontSize"),
  speed: document.querySelector("#speed"),
  opacity: document.querySelector("#opacity"),
  maxRows: document.querySelector("#maxRows"),
  verticalStart: document.querySelector("#verticalStart"),
  verticalEnd: document.querySelector("#verticalEnd"),
  showUsernames: document.querySelector("#showUsernames"),
  showBadges: document.querySelector("#showBadges"),
  showEmotes: document.querySelector("#showEmotes"),
  showUrls: document.querySelector("#showUrls"),
  hideSubscriptions: document.querySelector("#hideSubscriptions"),
  hideCheers: document.querySelector("#hideCheers"),
  hideNightbot: document.querySelector("#hideNightbot"),
  showOnlyWhenVideoVisible: document.querySelector("#showOnlyWhenVideoVisible")
};

const resetButton = document.querySelector("#resetButton");
const statusMessage = document.querySelector("#statusMessage");
const modeSections = Array.from(document.querySelectorAll("[data-mode-section]"));
let statusTimer = null;
let currentLanguage = normalizeLanguage(DEFAULT_SETTINGS.language);
let optionStrings = getLocalizedStrings(currentLanguage, "options");

function readControlValue(control) {
  if (control.type === "checkbox") {
    return control.checked;
  }
  if (control.tagName === "SELECT") {
    return control.value;
  }
  return Number(control.value);
}

function writeControlValue(control, value) {
  if (control.type === "checkbox") {
    control.checked = Boolean(value);
    return;
  }
  control.value = String(value);
}

function showStatus(message) {
  statusMessage.value = message;
  if (statusTimer) {
    clearTimeout(statusTimer);
  }
  statusTimer = window.setTimeout(() => {
    statusMessage.value = "";
  }, 1800);
}

function saveSettings(patch) {
  if (typeof patch.language === "string") {
    updateLocalization(patch.language);
  }
  chrome.storage.local.set(patch, () => {
    showStatus(optionStrings.saved);
  });
}

function updateLocalization(language) {
  currentLanguage = normalizeLanguage(language);
  optionStrings = getLocalizedStrings(currentLanguage, "options");
  document.documentElement.lang = currentLanguage;
  document.title = optionStrings.pageTitle;
  applyLocalizedContent(document, optionStrings);
}

function syncModeSections(displayMode) {
  for (const section of modeSections) {
    section.hidden = section.dataset.modeSection !== displayMode;
  }
}

function syncVerticalRange(changedKey, nextSettings) {
  if (changedKey !== "verticalStart" && changedKey !== "verticalEnd") {
    return;
  }

  const start = changedKey === "verticalStart"
    ? nextSettings.verticalStart
    : readControlValue(controls.verticalStart);
  const end = changedKey === "verticalEnd"
    ? nextSettings.verticalEnd
    : readControlValue(controls.verticalEnd);

  if (start >= end) {
    if (changedKey === "verticalStart") {
      nextSettings.verticalEnd = clamp(start + 10, ...POPUP_RANGES.verticalEnd);
      writeControlValue(controls.verticalEnd, nextSettings.verticalEnd);
    } else {
      nextSettings.verticalStart = clamp(end - 10, ...POPUP_RANGES.verticalStart);
      writeControlValue(controls.verticalStart, nextSettings.verticalStart);
    }
  }
}

chrome.storage.local.get(DEFAULT_SETTINGS, (settings) => {
  const normalizedSettings = normalizeSettings(settings);
  updateLocalization(normalizedSettings.language);
  for (const [key, control] of Object.entries(controls)) {
    writeControlValue(control, normalizedSettings[key]);
    control.addEventListener("input", () => {
      const nextSettings = { [key]: readControlValue(control) };
      syncVerticalRange(key, nextSettings);
      if (key === "displayMode") {
        syncModeSections(nextSettings.displayMode);
      }
      saveSettings(nextSettings);
    });
  }
  syncModeSections(normalizedSettings.displayMode);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") {
    return;
  }

  for (const [key, change] of Object.entries(changes)) {
    if (!SETTING_KEYS.includes(key) || !controls[key]) {
      continue;
    }
    writeControlValue(controls[key], change.newValue);
  }

  if (changes.language) {
    updateLocalization(changes.language.newValue);
  }

  if (changes.displayMode) {
    syncModeSections(changes.displayMode.newValue);
  }
});

resetButton.addEventListener("click", () => {
  chrome.storage.local.set(DEFAULT_SETTINGS, () => {
    for (const [key, control] of Object.entries(controls)) {
      writeControlValue(control, DEFAULT_SETTINGS[key]);
    }
    updateLocalization(DEFAULT_SETTINGS.language);
    syncModeSections(DEFAULT_SETTINGS.displayMode);
    showStatus(optionStrings.restoredDefaults);
  });
});

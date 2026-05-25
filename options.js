const { DEFAULT_SETTINGS, POPUP_RANGES, SETTING_KEYS, clamp } = globalThis.TCO_SETTINGS;

const controls = {
  enabled: document.querySelector("#enabled"),
  fontSize: document.querySelector("#fontSize"),
  speed: document.querySelector("#speed"),
  opacity: document.querySelector("#opacity"),
  maxRows: document.querySelector("#maxRows"),
  verticalStart: document.querySelector("#verticalStart"),
  verticalEnd: document.querySelector("#verticalEnd"),
  showUsernames: document.querySelector("#showUsernames"),
  showBadges: document.querySelector("#showBadges"),
  showEmotes: document.querySelector("#showEmotes"),
  hideSubscriptions: document.querySelector("#hideSubscriptions"),
  hideCheers: document.querySelector("#hideCheers")
};

const resetButton = document.querySelector("#resetButton");
const statusMessage = document.querySelector("#statusMessage");
let statusTimer = null;

function readControlValue(control) {
  if (control.type === "checkbox") {
    return control.checked;
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
  chrome.storage.local.set(patch, () => {
    showStatus("保存しました");
  });
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
  for (const [key, control] of Object.entries(controls)) {
    writeControlValue(control, settings[key]);
    control.addEventListener("input", () => {
      const nextSettings = { [key]: readControlValue(control) };
      syncVerticalRange(key, nextSettings);
      saveSettings(nextSettings);
    });
  }
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
});

resetButton.addEventListener("click", () => {
  chrome.storage.local.set(DEFAULT_SETTINGS, () => {
    for (const [key, control] of Object.entries(controls)) {
      writeControlValue(control, DEFAULT_SETTINGS[key]);
    }
    showStatus("デフォルト設定に戻しました");
  });
});

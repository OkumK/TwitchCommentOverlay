const {
  DEFAULT_SETTINGS,
  POPUP_RANGES,
  SETTING_KEYS,
  applyLocalizedContent,
  clamp,
  getLocalizedStrings,
  normalizeLanguage,
  normalizeSettings
} = globalThis.TCO_SETTINGS || {};

if (!DEFAULT_SETTINGS || !POPUP_RANGES || !SETTING_KEYS || !applyLocalizedContent || !clamp || !getLocalizedStrings || !normalizeLanguage || !normalizeSettings) {
  throw new Error("TCO_SETTINGS is not available. Make sure settings.js loads before popup.js.");
}

const controls = {
  enabled: document.querySelector("#enabled"),
  language: document.querySelector("#language"),
  displayMode: document.querySelector("#displayMode"),
  fontSize: document.querySelector("#fontSize"),
  speed: document.querySelector("#speed"),
  opacity: document.querySelector("#opacity"),
  maxRows: document.querySelector("#maxRows"),
  showUsernames: document.querySelector("#showUsernames"),
  showBadges: document.querySelector("#showBadges"),
  showEmotes: document.querySelector("#showEmotes"),
  showUrls: document.querySelector("#showUrls"),
  hideSubscriptions: document.querySelector("#hideSubscriptions"),
  hideCheers: document.querySelector("#hideCheers"),
  hideNightbot: document.querySelector("#hideNightbot"),
  showOnlyWhenVideoVisible: document.querySelector("#showOnlyWhenVideoVisible")
};

const valueOutputs = {
  fontSize: document.querySelector("#fontSizeValue"),
  speed: document.querySelector("#speedValue"),
  opacity: document.querySelector("#opacityValue"),
  maxRows: document.querySelector("#maxRowsValue")
};

const diagnosticsOutput = document.querySelector("#diagnostics");
const testOverlayButton = document.querySelector("#testOverlay");
const areaEditor = document.querySelector("#areaEditor");
const areaTrack = document.querySelector(".area-editor__track");
const areaSelection = document.querySelector("#areaSelection");
const areaStartHandle = document.querySelector("#areaStartHandle");
const areaEndHandle = document.querySelector("#areaEndHandle");
const areaRangeLabel = document.querySelector("#areaRangeLabel");
const modeSections = Array.from(document.querySelectorAll("[data-mode-section]"));
const TWITCH_URL_PATTERN = /^https:\/\/(www\.)?twitch\.tv\//;
const MIN_VERTICAL_GAP = 10;

let areaDragState = null;
let areaEditorSyncFrame = null;
let verticalStart = DEFAULT_SETTINGS.verticalStart;
let verticalEnd = DEFAULT_SETTINGS.verticalEnd;
let currentLanguage = normalizeLanguage(DEFAULT_SETTINGS.language);
let popupStrings = getLocalizedStrings(currentLanguage, "popup");
let latestDiagnostics = null;
let controlsReady = false;

function updateLocalization(language) {
  currentLanguage = normalizeLanguage(language);
  popupStrings = getLocalizedStrings(currentLanguage, "popup");
  document.documentElement.lang = currentLanguage;
  document.title = popupStrings.pageTitle;
  applyLocalizedContent(document, popupStrings);

  if (latestDiagnostics) {
    renderDiagnostics(latestDiagnostics);
  } else {
    diagnosticsOutput.value = popupStrings.waitingConnection;
  }

  if (controlsReady) {
    syncSliderOutputs();
  }
}

function syncModeSections(displayMode) {
  for (const section of modeSections) {
    section.hidden = section.dataset.modeSection !== displayMode;
  }
}

function scheduleAreaEditorSync() {
  if (areaEditorSyncFrame != null) {
    const cancelFrame = window.cancelAnimationFrame || window.clearTimeout;
    cancelFrame(areaEditorSyncFrame);
  }

  const scheduleFrame = window.requestAnimationFrame || ((callback) => window.setTimeout(callback, 0));
  areaEditorSyncFrame = scheduleFrame(() => {
    areaEditorSyncFrame = null;
    syncAreaEditor();
  });
}

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

function formatSliderValue(key, value) {
  if (key === "fontSize") {
    return `${value} ${popupStrings.fontSizeUnit}`;
  }
  if (key === "speed") {
    return `${value} ${popupStrings.speedUnit}`;
  }
  if (key === "opacity") {
    return `${value}%`;
  }
  if (key === "maxRows") {
    return `${value} ${popupStrings.maxRowsUnit}`;
  }
  return String(value);
}

function syncSliderOutputs() {
  for (const key of Object.keys(valueOutputs)) {
    const output = valueOutputs[key];
    const control = controls[key];
    if (!output || !control) {
      continue;
    }
    output.value = formatSliderValue(key, readControlValue(control));
  }
}

function syncAreaEditor() {
  if (!areaEditor || !areaTrack || !areaSelection || !areaStartHandle || !areaEndHandle || !areaRangeLabel) {
    return;
  }

  const editorRect = areaEditor.getBoundingClientRect();
  const trackRect = areaTrack.getBoundingClientRect();
  const trackTop = trackRect.top - editorRect.top;
  const trackHeight = trackRect.height;
  const startTop = trackTop + (verticalStart / 100) * trackHeight;
  const endTop = trackTop + (verticalEnd / 100) * trackHeight;

  areaSelection.style.top = `${startTop}px`;
  areaSelection.style.height = `${Math.max(endTop - startTop, (MIN_VERTICAL_GAP / 100) * trackHeight)}px`;
  areaStartHandle.style.top = `${startTop}px`;
  areaEndHandle.style.top = `${endTop}px`;
  areaRangeLabel.value = `${verticalStart}% - ${verticalEnd}%`;
}

function persistVerticalRange() {
  chrome.storage.local.set({
    verticalStart,
    verticalEnd
  });
}

function setVerticalRange(nextStart, nextEnd) {
  verticalStart = clamp(nextStart, ...POPUP_RANGES.verticalStart);
  verticalEnd = clamp(nextEnd, ...POPUP_RANGES.verticalEnd);

  if (verticalEnd - verticalStart < MIN_VERTICAL_GAP) {
    if (areaDragState?.handle === "start") {
      verticalStart = verticalEnd - MIN_VERTICAL_GAP;
      verticalStart = clamp(verticalStart, ...POPUP_RANGES.verticalStart);
    } else {
      verticalEnd = verticalStart + MIN_VERTICAL_GAP;
      verticalEnd = clamp(verticalEnd, ...POPUP_RANGES.verticalEnd);
    }
  }

  syncAreaEditor();
  persistVerticalRange();
}

function getPointerVerticalPercent(event) {
  const rect = areaTrack?.getBoundingClientRect?.() || areaEditor.getBoundingClientRect();
  const offsetY = event.clientY - rect.top;
  const ratio = clamp(offsetY / rect.height, 0, 1);
  return Math.round(ratio * 100);
}

function updateDraggedHandle(event) {
  if (!areaDragState) {
    return;
  }

  const position = getPointerVerticalPercent(event);
  if (areaDragState.handle === "start") {
    const nextStart = clamp(position, POPUP_RANGES.verticalStart[0], verticalEnd - MIN_VERTICAL_GAP);
    setVerticalRange(nextStart, verticalEnd);
    return;
  }

  const nextEnd = clamp(position, verticalStart + MIN_VERTICAL_GAP, POPUP_RANGES.verticalEnd[1]);
  setVerticalRange(verticalStart, nextEnd);
}

function attachAreaEditorEvents() {
  if (!areaEditor || !areaStartHandle || !areaEndHandle) {
    return;
  }

  const beginDrag = (handle, event) => {
    event.preventDefault();
    areaDragState = { handle };
    updateDraggedHandle(event);
  };

  areaStartHandle.addEventListener("pointerdown", (event) => beginDrag("start", event));
  areaEndHandle.addEventListener("pointerdown", (event) => beginDrag("end", event));

  window.addEventListener("pointermove", (event) => {
    if (!areaDragState) {
      return;
    }
    updateDraggedHandle(event);
  });

  window.addEventListener("pointerup", () => {
    areaDragState = null;
  });
}

function formatDiagnostics(diagnostics) {
  if (!diagnostics) {
    return popupStrings.monitoringDisconnected;
  }

  const monitorState = diagnostics.observerMode === "chat-container"
    ? popupStrings.monitoringConnected
    : popupStrings.monitoringScanning;
  const messageCount = `${popupStrings.detectedMessages}: ${diagnostics.matchedMessageCount || 0}`;
  const lastMessage = diagnostics.lastMessageAt
    ? `${popupStrings.lastMessage}: ${new Date(diagnostics.lastMessageAt).toLocaleTimeString()}`
    : `${popupStrings.lastMessage}: ${popupStrings.noneYet}`;

  return `${monitorState}\n${messageCount}\n${lastMessage}`;
}

function renderDiagnostics(diagnostics) {
  latestDiagnostics = diagnostics || null;
  diagnosticsOutput.value = formatDiagnostics(diagnostics);
}

function renderStatus(message) {
  diagnosticsOutput.value = message;
}

function getActiveTab(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    callback(tab);
  });
}

function getRuntimeError() {
  return chrome.runtime.lastError?.message || "";
}

function ensureContentScript(tab, callback) {
  if (!tab?.id) {
    callback(new Error(popupStrings.couldNotGetActiveTab));
    return;
  }

  if (!TWITCH_URL_PATTERN.test(tab.url || "")) {
    callback(new Error(popupStrings.openTwitchPage));
    return;
  }

  chrome.scripting.insertCSS({
    target: { tabId: tab.id },
    files: ["overlay.css"]
  }, () => {
    const cssError = getRuntimeError();
    if (cssError) {
      callback(new Error(cssError));
      return;
    }

    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["settings.js"]
    }, () => {
      const settingsError = getRuntimeError();
      if (settingsError) {
        callback(new Error(settingsError));
        return;
      }

      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"]
      }, () => {
        const contentError = getRuntimeError();
        if (contentError) {
          callback(new Error(contentError));
          return;
        }

        callback(null, tab);
      });
    });
  });
}

function sendMessageToActiveTwitchTab(message, callback) {
  getActiveTab((tab) => {
    ensureContentScript(tab, (error) => {
      if (error) {
        callback(error);
        return;
      }

      chrome.tabs.sendMessage(tab.id, message, (response) => {
        const messageError = getRuntimeError();
        if (messageError) {
          callback(new Error(messageError));
          return;
        }

        callback(null, response);
      });
    });
  });
}

chrome.storage.local.get(DEFAULT_SETTINGS, (settings) => {
  const normalizedSettings = normalizeSettings(settings);
  verticalStart = clamp(Number(normalizedSettings.verticalStart), ...POPUP_RANGES.verticalStart);
  verticalEnd = clamp(Number(normalizedSettings.verticalEnd), ...POPUP_RANGES.verticalEnd);
  if (verticalEnd - verticalStart < MIN_VERTICAL_GAP) {
    verticalEnd = clamp(verticalStart + MIN_VERTICAL_GAP, ...POPUP_RANGES.verticalEnd);
  }

  updateLocalization(normalizedSettings.language);

  for (const [key, control] of Object.entries(controls)) {
    writeControlValue(control, normalizedSettings[key]);
    control.addEventListener("input", () => {
      const nextValue = readControlValue(control);
      if (key === "language") {
        updateLocalization(nextValue);
      }
      if (key === "displayMode") {
        syncModeSections(nextValue);
        if (nextValue === "niconico") {
          scheduleAreaEditorSync();
        }
        chrome.storage.local.set({
          displayMode: nextValue
        });
      } else {
        chrome.storage.local.set({ [key]: nextValue });
      }
      syncSliderOutputs();
    });
  }

  controlsReady = true;
  syncModeSections(normalizedSettings.displayMode);
  syncSliderOutputs();
  if (normalizedSettings.displayMode === "niconico") {
    scheduleAreaEditorSync();
  }
  attachAreaEditorEvents();
});

chrome.storage.local.get("tcoDiagnostics", ({ tcoDiagnostics }) => {
  renderDiagnostics(tcoDiagnostics);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") {
    return;
  }

  if (changes.tcoDiagnostics) {
    renderDiagnostics(changes.tcoDiagnostics.newValue);
  }

  if (changes.language) {
    updateLocalization(changes.language.newValue);
  }

  if (changes.displayMode) {
    syncModeSections(changes.displayMode.newValue);
    if (changes.displayMode.newValue === "niconico") {
      scheduleAreaEditorSync();
    }
  }

  if (changes.verticalStart || changes.verticalEnd) {
    if (changes.verticalStart) {
      verticalStart = clamp(Number(changes.verticalStart.newValue), ...POPUP_RANGES.verticalStart);
    }
    if (changes.verticalEnd) {
      verticalEnd = clamp(Number(changes.verticalEnd.newValue), ...POPUP_RANGES.verticalEnd);
    }
    if (verticalEnd - verticalStart < MIN_VERTICAL_GAP) {
      verticalEnd = clamp(verticalStart + MIN_VERTICAL_GAP, ...POPUP_RANGES.verticalEnd);
    }
    syncAreaEditor();
  }

  for (const [key, change] of Object.entries(changes)) {
    if (!SETTING_KEYS.includes(key) || !controls[key]) {
      continue;
    }
    writeControlValue(controls[key], change.newValue);
  }

  syncSliderOutputs();
});

testOverlayButton.addEventListener("click", () => {
  renderStatus(popupStrings.sendingTestMessage);
  sendMessageToActiveTwitchTab({ type: "TCO_TEST_MESSAGE" }, (error, response) => {
    if (error) {
      renderStatus(`${popupStrings.testFailed}\n${error.message}`);
      return;
    }

    renderDiagnostics(response?.diagnostics);
  });
});

sendMessageToActiveTwitchTab({ type: "TCO_GET_DIAGNOSTICS" }, (error, response) => {
  if (error) {
    renderStatus(error.message);
    return;
  }

  renderDiagnostics(response?.diagnostics);
});

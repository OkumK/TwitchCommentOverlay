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
  fontSize: document.querySelector("#fontSize"),
  speed: document.querySelector("#speed"),
  opacity: document.querySelector("#opacity"),
  maxRows: document.querySelector("#maxRows"),
  showUsernames: document.querySelector("#showUsernames"),
  showBadges: document.querySelector("#showBadges"),
  showEmotes: document.querySelector("#showEmotes"),
  hideSubscriptions: document.querySelector("#hideSubscriptions"),
  hideCheers: document.querySelector("#hideCheers")
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
const areaSelection = document.querySelector("#areaSelection");
const areaStartHandle = document.querySelector("#areaStartHandle");
const areaEndHandle = document.querySelector("#areaEndHandle");
const areaRangeLabel = document.querySelector("#areaRangeLabel");
const TWITCH_URL_PATTERN = /^https:\/\/(www\.)?twitch\.tv\//;
const MIN_VERTICAL_GAP = 10;

let areaDragState = null;
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
  if (!areaEditor || !areaSelection || !areaStartHandle || !areaEndHandle || !areaRangeLabel) {
    return;
  }

  areaSelection.style.top = `${verticalStart}%`;
  areaSelection.style.height = `${Math.max(verticalEnd - verticalStart, MIN_VERTICAL_GAP)}%`;
  areaStartHandle.style.top = `${verticalStart}%`;
  areaEndHandle.style.top = `${verticalEnd}%`;
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
  const rect = areaEditor.getBoundingClientRect();
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
      chrome.storage.local.set({ [key]: readControlValue(control) });
      syncSliderOutputs();
    });
  }

  controlsReady = true;
  syncSliderOutputs();
  syncAreaEditor();
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

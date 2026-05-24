const { DEFAULT_SETTINGS, POPUP_RANGES, SETTING_KEYS, clamp } = globalThis.TCO_SETTINGS;

const controls = {
  enabled: document.querySelector("#enabled"),
  fontSize: document.querySelector("#fontSize"),
  speed: document.querySelector("#speed"),
  opacity: document.querySelector("#opacity"),
  maxRows: document.querySelector("#maxRows"),
  verticalStart: document.querySelector("#verticalStart"),
  verticalEnd: document.querySelector("#verticalEnd"),
  showUsernames: document.querySelector("#showUsernames")
};

const diagnosticsOutput = document.querySelector("#diagnostics");
const testOverlayButton = document.querySelector("#testOverlay");

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

function formatDiagnostics(diagnostics) {
  if (!diagnostics) {
    return "content script の診断情報はまだありません";
  }

  const status = diagnostics.observerMode === "chat-container"
    ? "チャット欄を監視中"
    : "ページ全体を補助監視中";
  const messageCount = diagnostics.matchedMessageCount || 0;
  const updatedAt = diagnostics.updatedAt
    ? `\n更新: ${new Date(diagnostics.updatedAt).toLocaleTimeString()}`
    : "";
  const lastMessage = diagnostics.lastMessagePreview
    ? `\n最新: ${diagnostics.lastMessagePreview}`
    : "";

  return `${status}\nコンテナ: ${diagnostics.chatContainerCount || 0} / 検出: ${messageCount}${lastMessage}${updatedAt}`;
}

function renderDiagnostics(diagnostics) {
  diagnosticsOutput.value = formatDiagnostics(diagnostics);
}

chrome.storage.local.get(DEFAULT_SETTINGS, (settings) => {
  for (const [key, control] of Object.entries(controls)) {
    writeControlValue(control, settings[key]);
    control.addEventListener("input", () => {
      const nextSettings = {};
      nextSettings[key] = readControlValue(control);

      if (key === "verticalStart" || key === "verticalEnd") {
        const start = key === "verticalStart" ? nextSettings.verticalStart : readControlValue(controls.verticalStart);
        const end = key === "verticalEnd" ? nextSettings.verticalEnd : readControlValue(controls.verticalEnd);
        if (start >= end) {
          if (key === "verticalStart") {
            nextSettings.verticalEnd = clamp(start + 10, ...POPUP_RANGES.verticalEnd);
            writeControlValue(controls.verticalEnd, nextSettings.verticalEnd);
          } else {
            nextSettings.verticalStart = clamp(end - 10, ...POPUP_RANGES.verticalStart);
            writeControlValue(controls.verticalStart, nextSettings.verticalStart);
          }
        }
      }

      chrome.storage.local.set(nextSettings);
    });
  }
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

  for (const [key, change] of Object.entries(changes)) {
    if (!SETTING_KEYS.includes(key) || !controls[key]) {
      continue;
    }
    writeControlValue(controls[key], change.newValue);
  }
});

testOverlayButton.addEventListener("click", () => {
  chrome.storage.local.set({ tcoTestMessageNonce: Date.now() });
});

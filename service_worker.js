const ENABLED_ICON_PATHS = {
  16: "assets/icons/icon-16.png",
  32: "assets/icons/icon-32.png",
  48: "assets/icons/icon-48.png",
  128: "assets/icons/icon-128.png"
};

const DISABLED_ICON_PATHS = {
  16: "assets/icons/icon-disabled-16.png",
  32: "assets/icons/icon-disabled-32.png",
  48: "assets/icons/icon-disabled-48.png",
  128: "assets/icons/icon-disabled-128.png"
};

function getRuntimeError() {
  return chrome.runtime.lastError?.message || "";
}

function setActionIcon(enabled) {
  chrome.action.setIcon({
    path: enabled ? ENABLED_ICON_PATHS : DISABLED_ICON_PATHS
  }, () => {
    void getRuntimeError();
  });
}

function syncActionIcon() {
  chrome.storage.local.get({ enabled: true }, ({ enabled }) => {
    setActionIcon(Boolean(enabled));
  });
}

chrome.runtime.onInstalled.addListener(syncActionIcon);
chrome.runtime.onStartup.addListener(syncActionIcon);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.enabled) {
    return;
  }

  setActionIcon(Boolean(changes.enabled.newValue));
});

syncActionIcon();

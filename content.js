(() => {
const CONTENT_SCRIPT_VERSION = "2026-05-24-context-guard";
const previousContentState = globalThis.TCO_CONTENT_STATE;
let previousContextActive = false;

try {
  previousContextActive = Boolean(previousContentState?.active && previousContentState.assertContext?.());
} catch (_error) {
  previousContextActive = false;
}

if (previousContentState?.version === CONTENT_SCRIPT_VERSION && previousContextActive) {
  return;
}

try {
  previousContentState?.cleanup?.();
} catch (_error) {
  // A stale content script can already be detached from the extension context.
}

const contentState = {
  active: true,
  version: CONTENT_SCRIPT_VERSION,
  assertContext: null,
  cleanup: null
};

globalThis.TCO_CONTENT_STATE = contentState;
globalThis.TCO_CONTENT_READY = CONTENT_SCRIPT_VERSION;

const { DEFAULT_SETTINGS, SETTING_KEYS, hasOwn, normalizeSettings } = globalThis.TCO_SETTINGS;

const CHAT_SELECTORS = [
  "[data-a-target='chat-line-message']",
  "[data-test-selector='chat-line-message']",
  ".chat-line__message",
  ".chat-line__moderation",
  ".chat-line__message-container",
  ".user-notice-line",
  "[data-a-user]"
];

const CHAT_CONTAINER_SELECTORS = [
  "[data-a-target='chat-scroller']",
  "[data-test-selector='chat-scroller']",
  ".chat-scrollable-area__message-container",
  "[data-test-selector='chat-scrollable-area__message-container']",
  ".chat-list--default",
  ".stream-chat",
  ".chat-room",
  "[role='log']"
];

const AUTHOR_SELECTORS = [
  "[data-a-target='chat-message-username']",
  "[data-test-selector='chat-message-username']",
  ".chat-author__display-name"
];

const MESSAGE_TEXT_SELECTORS = [
  "[data-a-target='chat-message-text']",
  "[data-test-selector='chat-message-text']",
  ".text-fragment"
];

const MESSAGE_BODY_SELECTORS = [
  "[data-a-target='chat-line-message-body']",
  "[data-test-selector='chat-line-message-body']"
];

let settings = { ...DEFAULT_SETTINGS };
let overlayRoot = null;
let observer = null;
let rowCursor = 0;
let seenMessages = new WeakSet();
let recentSignatures = new Map();
let chatRetryTimer = null;
let urlWatchTimer = null;
let diagnostics = {
  observerMode: "not-started",
  chatContainerCount: 0,
  matchedMessageCount: 0,
  lastMessageAt: null,
  lastMessagePreview: ""
};

function teardownContentScript() {
  if (!contentState.active) {
    return;
  }

  contentState.active = false;
  observer?.disconnect();
  observer = null;

  if (chatRetryTimer) {
    window.clearTimeout(chatRetryTimer);
    chatRetryTimer = null;
  }

  if (urlWatchTimer) {
    window.clearInterval(urlWatchTimer);
    urlWatchTimer = null;
  }

  overlayRoot?.remove();
  overlayRoot = null;
}

contentState.cleanup = teardownContentScript;

function assertExtensionContextAvailable() {
  if (typeof chrome === "undefined" || !chrome.runtime?.id) {
    return false;
  }

  chrome.runtime.getURL("");
  return true;
}

contentState.assertContext = assertExtensionContextAvailable;

function isExtensionContextAvailable() {
  try {
    return assertExtensionContextAvailable();
  } catch (_error) {
    return false;
  }
}

function isInvalidatedContextError(error) {
  return error?.message?.includes("Extension context invalidated");
}

function handleChromeApiError(error) {
  if (isInvalidatedContextError(error) || !isExtensionContextAvailable()) {
    teardownContentScript();
    return;
  }

  console.warn("Twitch Comment Overlay: Chrome API call failed", error);
}

function safeChromeCall(callback) {
  if (!contentState.active || !isExtensionContextAvailable()) {
    teardownContentScript();
    return false;
  }

  try {
    callback();
    return true;
  } catch (error) {
    handleChromeApiError(error);
    return false;
  }
}

function publishDiagnostics(patch) {
  diagnostics = {
    ...diagnostics,
    ...patch,
    updatedAt: new Date().toISOString()
  };

  safeChromeCall(() => {
    chrome.storage.local.set({ tcoDiagnostics: diagnostics });
  });
}

function createOverlay() {
  if (overlayRoot) {
    return overlayRoot;
  }

  overlayRoot = document.createElement("div");
  overlayRoot.id = "tco-overlay-root";
  document.documentElement.appendChild(overlayRoot);
  applySettings();
  return overlayRoot;
}

function applySettings() {
  if (!overlayRoot) {
    return;
  }

  overlayRoot.classList.toggle("tco-hidden", !settings.enabled);
  overlayRoot.style.setProperty("--tco-font-size", `${settings.fontSize}px`);
  overlayRoot.style.opacity = String(settings.opacity / 100);
}

function getChatContainers() {
  const containers = CHAT_CONTAINER_SELECTORS
    .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
    .filter(Boolean);

  // Avoid attaching multiple observers to the same element when selectors overlap.
  return Array.from(new Set(containers));
}

function findChatMessageNode(node) {
  if (!(node instanceof Element)) {
    return null;
  }

  if (CHAT_SELECTORS.some((selector) => node.matches(selector))) {
    return node;
  }

  const closestMessage = node.closest(CHAT_SELECTORS.join(", "));
  if (closestMessage) {
    return closestMessage;
  }

  return node.querySelector(CHAT_SELECTORS.join(", "));
}

function findFirstMatchingElement(root, selectors) {
  return selectors
    .map((selector) => root.querySelector(selector))
    .find(Boolean);
}

function findUniqueMatchingElements(root, selectors) {
  const elements = new Set();
  for (const selector of selectors) {
    for (const element of root.querySelectorAll(selector)) {
      elements.add(element);
    }
  }

  return Array.from(elements);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeText(value) {
  return value?.replace(/\s+/g, " ").trim() || "";
}

function stripAuthorPrefix(text, author) {
  let normalizedText = text;
  if (!author) {
    return normalizedText.replace(/^[:：]\s*/, "").trim();
  }

  normalizedText = normalizedText
    .replace(new RegExp(`^${escapeRegExp(author)}\\s*:?\\s*`, "i"), "")
    .trim();

  return normalizedText
    .replace(/^[:：]\s*/, "")
    .trim();
}

function isInsideAuthorNode(node, messageNode) {
  const authorAncestor = node.closest(AUTHOR_SELECTORS.join(", "));
  return Boolean(authorAncestor && messageNode.contains(authorAncestor));
}

function getTextFromFragments(messageNode) {
  return findUniqueMatchingElements(messageNode, MESSAGE_TEXT_SELECTORS)
    .filter((node) => !isInsideAuthorNode(node, messageNode))
    .map((node) => normalizeText(node.textContent))
    .filter(Boolean)
    .join(" ")
    .trim();
}

function getTextFromNodeWithoutAuthor(node, author) {
  const clone = node.cloneNode(true);
  for (const authorNode of findUniqueMatchingElements(clone, AUTHOR_SELECTORS)) {
    authorNode.remove();
  }

  return stripAuthorPrefix(normalizeText(clone.textContent), author);
}

function getFallbackMessageText(messageNode, author) {
  for (const bodyNode of findUniqueMatchingElements(messageNode, MESSAGE_BODY_SELECTORS)) {
    const bodyText = normalizeText(bodyNode.textContent);
    if (bodyText) {
      return bodyText;
    }
  }

  return getTextFromNodeWithoutAuthor(messageNode, author);
}

function getMessageParts(messageNode) {
  const authorNode = findFirstMatchingElement(messageNode, AUTHOR_SELECTORS);

  const author = authorNode?.textContent?.trim() || messageNode.getAttribute("data-a-user") || "";
  const text = getTextFromFragments(messageNode) || getFallbackMessageText(messageNode, author);

  return { author, text };
}

function isDuplicate(author, text) {
  const signature = `${author}\n${text}`;
  const now = Date.now();
  const lastSeen = recentSignatures.get(signature);

  for (const [key, timestamp] of recentSignatures) {
    if (now - timestamp > 5000) {
      recentSignatures.delete(key);
    }
  }

  if (lastSeen && now - lastSeen < 1500) {
    return true;
  }

  recentSignatures.set(signature, now);
  return false;
}

function displayComment({ author, text }, options = {}) {
  if ((!settings.enabled && !options.force) || !text) {
    return;
  }

  const root = createOverlay();
  const comment = document.createElement("div");
  comment.className = "tco-comment";
  comment.style.animationDuration = `${settings.speed}s`;
  if (options.force) {
    root.classList.remove("tco-hidden");
  }

  const usableHeight = Math.max(settings.verticalEnd - settings.verticalStart, 10);
  const rows = Math.max(settings.maxRows, 1);
  const rowHeight = usableHeight / rows;
  const top = settings.verticalStart + rowHeight * (rowCursor % rows);
  rowCursor += 1;

  comment.style.top = `${top}vh`;

  if (settings.showUsernames && author) {
    const authorElement = document.createElement("strong");
    authorElement.textContent = author;
    comment.appendChild(authorElement);
  }

  comment.append(document.createTextNode(text));
  root.appendChild(comment);
  publishDiagnostics({
    lastMessageAt: new Date().toISOString(),
    lastMessagePreview: text.slice(0, 80)
  });
  comment.addEventListener("animationend", () => {
    comment.remove();
    if (options.force) {
      applySettings();
    }
  }, { once: true });
}

function handlePotentialMessage(node) {
  const messageNode = findChatMessageNode(node);
  if (!messageNode) {
    return;
  }

  const message = getMessageParts(messageNode);
  if (!message.text || seenMessages.has(messageNode)) {
    return;
  }

  seenMessages.add(messageNode);
  diagnostics.matchedMessageCount += 1;
  if (isDuplicate(message.author, message.text)) {
    return;
  }

  displayComment(message);
}

function observeChat() {
  observer?.disconnect();
  if (chatRetryTimer) {
    window.clearTimeout(chatRetryTimer);
    chatRetryTimer = null;
  }

  const containers = getChatContainers();
  if (!containers.length) {
    const fallbackRoot = document.body || document.documentElement;
    if (fallbackRoot) {
      observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            handlePotentialMessage(node);
          }
        }
      });
      observer.observe(fallbackRoot, { childList: true, subtree: true });
      publishDiagnostics({
        observerMode: "document-fallback",
        chatContainerCount: 0
      });
    }
    chatRetryTimer = window.setTimeout(observeChat, 1000);
    return;
  }

  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        handlePotentialMessage(node);
      }
    }
  });

  for (const container of containers) {
    observer.observe(container, { childList: true, subtree: true });
    container.querySelectorAll(CHAT_SELECTORS.join(", ")).forEach((node) => {
      handlePotentialMessage(node);
    });
  }

  publishDiagnostics({
    observerMode: "chat-container",
    chatContainerCount: containers.length
  });
}

function loadSettings() {
  safeChromeCall(() => {
    chrome.storage.local.get(null, (localSettings) => {
      if (!contentState.active) {
        return;
      }

      const hasLocal = SETTING_KEYS.some((key) => hasOwn(localSettings || {}, key));
      if (hasLocal) {
        settings = normalizeSettings(localSettings);
        createOverlay();
        observeChat();
        return;
      }

      safeChromeCall(() => {
        chrome.storage.sync.get(DEFAULT_SETTINGS, (syncSettings) => {
          if (!contentState.active) {
            return;
          }

          settings = normalizeSettings(syncSettings);
          safeChromeCall(() => {
            chrome.storage.local.set(settings, () => {
              if (!contentState.active) {
                return;
              }

              createOverlay();
              observeChat();
            });
          });
        });
      });
    });
  });
}

safeChromeCall(() => {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (!contentState.active) {
      return;
    }

    if (area !== "local") {
      return;
    }

    if (hasOwn(changes, "tcoTestMessageNonce")) {
      displayComment({
        author: "TCO",
        text: "Overlay test message"
      }, { force: true });
    }

    const nextSettings = { ...settings };
    let settingsChanged = false;
    for (const [key, change] of Object.entries(changes)) {
      if (!SETTING_KEYS.includes(key)) {
        continue;
      }
      settingsChanged = true;
      nextSettings[key] = change.newValue;
    }

    if (!settingsChanged) {
      return;
    }

    settings = normalizeSettings(nextSettings);
    applySettings();
  });
});

safeChromeCall(() => {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!contentState.active) {
      return false;
    }

    if (!message) {
      return false;
    }

    if (message.type === "TCO_TEST_MESSAGE") {
      displayComment({
        author: "TCO",
        text: "Overlay test message"
      }, { force: true });
      sendResponse({ ok: true, diagnostics });
      return false;
    }

    if (message.type === "TCO_GET_DIAGNOSTICS") {
      sendResponse({ ok: true, diagnostics });
      return false;
    }

    return false;
  });
});

let currentUrl = location.href;
if (contentState.active) {
  urlWatchTimer = window.setInterval(() => {
    if (!contentState.active) {
      return;
    }

    if (!isExtensionContextAvailable()) {
      teardownContentScript();
      return;
    }

    if (location.href === currentUrl) {
      return;
    }

    currentUrl = location.href;
    rowCursor = 0;
    seenMessages = new WeakSet();
    recentSignatures.clear();
    observeChat();
  }, 1000);

  loadSettings();
}
})();

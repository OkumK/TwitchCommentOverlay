const { DEFAULT_SETTINGS, SETTING_KEYS, normalizeSettings } = globalThis.TCO_SETTINGS;

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
  "[data-a-target='chat-line-message-body']",
  "[data-test-selector='chat-line-message-body']",
  ".text-fragment"
];

let settings = { ...DEFAULT_SETTINGS };
let overlayRoot = null;
let observer = null;
let rowCursor = 0;
let seenMessages = new WeakSet();
let recentSignatures = new Map();
let chatRetryTimer = null;
let diagnostics = {
  observerMode: "not-started",
  chatContainerCount: 0,
  matchedMessageCount: 0,
  lastMessageAt: null,
  lastMessagePreview: ""
};

function publishDiagnostics(patch) {
  diagnostics = {
    ...diagnostics,
    ...patch,
    updatedAt: new Date().toISOString()
  };
  chrome.storage.local.set({ tcoDiagnostics: diagnostics });
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
  return CHAT_CONTAINER_SELECTORS
    .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
    .filter(Boolean);
}

function findChatMessageNode(node) {
  if (!(node instanceof Element)) {
    return null;
  }

  if (CHAT_SELECTORS.some((selector) => node.matches(selector))) {
    return node;
  }

  return node.querySelector(CHAT_SELECTORS.join(", "));
}

function getMessageParts(messageNode) {
  const authorNode = AUTHOR_SELECTORS
    .map((selector) => messageNode.querySelector(selector))
    .find(Boolean);

  const textNodes = MESSAGE_TEXT_SELECTORS
    .flatMap((selector) => Array.from(messageNode.querySelectorAll(selector)));

  const author = authorNode?.textContent?.trim() || messageNode.getAttribute("data-a-user") || "";
  const text = textNodes
    .map((node) => node.textContent?.trim())
    .filter(Boolean)
    .join(" ")
    .trim();

  if (text) {
    return { author, text };
  }

  const fallbackText = messageNode.textContent?.replace(/\s+/g, " ").trim() || "";
  const normalizedText = author && fallbackText.startsWith(author)
    ? fallbackText.slice(author.length).trim()
    : fallbackText;

  return {
    author,
    text: normalizedText
  };
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
  if (!messageNode || seenMessages.has(messageNode)) {
    return;
  }

  seenMessages.add(messageNode);
  diagnostics.matchedMessageCount += 1;
  const message = getMessageParts(messageNode);

  if (!message.text || isDuplicate(message.author, message.text)) {
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
  chrome.storage.local.get(null, (localSettings) => {
    const hasLocal = SETTING_KEYS.some((key) => Object.hasOwn(localSettings || {}, key));
    if (hasLocal) {
      settings = normalizeSettings(localSettings);
      createOverlay();
      observeChat();
      return;
    }

    chrome.storage.sync.get(DEFAULT_SETTINGS, (syncSettings) => {
      settings = normalizeSettings(syncSettings);
      chrome.storage.local.set(settings, () => {
        createOverlay();
        observeChat();
      });
    });
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") {
    return;
  }

  if (Object.hasOwn(changes, "tcoTestMessageNonce")) {
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

let currentUrl = location.href;
window.setInterval(() => {
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

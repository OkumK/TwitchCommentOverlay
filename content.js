(() => {
const CONTENT_SCRIPT_VERSION = "2026-05-28-video-area";
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

const VIDEO_CHAT_MESSAGE_SELECTOR = ".video-chat__message";
const EMOTE_CONTAINER_SELECTOR = "[data-a-target='emote-name']";
const EMOTE_IMAGE_SELECTOR = ".chat-line__message--emote, .chat-image";
const CHAT_BADGE_SELECTOR = ".chat-badge";
const CHEER_AMOUNT_SELECTORS = [
  ".chat-line__message--cheer-amount",
  "[data-test-selector='chat-line-message-cheer-amount']",
  "[data-test-selector='bits-cheer-amount']"
];
const MESSAGE_TIMESTAMP_SELECTORS = [
  "time[datetime]",
  "[data-a-target='chat-message-timestamp']",
  "[data-test-selector='chat-message-timestamp']",
  "[data-timestamp]",
  "[data-created-at]"
];
const VIDEO_VISIBILITY_SELECTORS = [
  "video",
  "[data-a-target='video-player']",
  "[data-a-target='player-overlay-click-handler']",
  ".video-player",
  ".video-player__container",
  ".player-overlay-background"
];
const INITIAL_MESSAGE_LOOKBACK_MS = 1000;
const INITIAL_MESSAGE_RENDER_LIMIT = 20;
let settings = { ...DEFAULT_SETTINGS };
let overlayRoot = null;
let observer = null;
let rowCursor = 0;
let rowReservations = [];
let queuedCommentTimers = new Set();
let seenMessages = new WeakSet();
let recentSignatures = new Map();
let chatRetryTimer = null;
let urlWatchTimer = null;
let viewportRefreshAttached = false;
let diagnostics = {
  observerMode: "not-started",
  chatContainerCount: 0,
  matchedMessageCount: 0,
  lastMessageAt: null
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

  if (viewportRefreshAttached) {
    window.removeEventListener("scroll", refreshOverlayVisibility, true);
    window.removeEventListener("resize", refreshOverlayVisibility);
    viewportRefreshAttached = false;
  }

  for (const timer of queuedCommentTimers) {
    window.clearTimeout(timer);
  }
  queuedCommentTimers.clear();
  rowReservations = [];

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
  ensureViewportVisibilityTracking();
  return overlayRoot;
}

function getViewportBounds() {
  return {
    left: 0,
    top: 0,
    width: getViewportWidth(),
    height: getViewportHeight()
  };
}

function getVideoVisibilityTargets() {
  const targets = VIDEO_VISIBILITY_SELECTORS
    .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
    .filter(Boolean);

  return Array.from(new Set(targets));
}

function getRectArea(rect) {
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

function getVisibleVideoBounds() {
  const viewportWidth = getViewportWidth();
  const viewportHeight = getViewportHeight();
  let bestRect = null;
  let bestArea = 0;

  for (const element of getVideoVisibilityTargets()) {
    const rect = element.getBoundingClientRect();
    const visibleLeft = Math.max(0, rect.left);
    const visibleTop = Math.max(0, rect.top);
    const visibleRight = Math.min(viewportWidth, rect.right);
    const visibleBottom = Math.min(viewportHeight, rect.bottom);
    const visibleWidth = Math.max(0, visibleRight - visibleLeft);
    const visibleHeight = Math.max(0, visibleBottom - visibleTop);
    const visibleArea = visibleWidth * visibleHeight;

    if (visibleArea <= bestArea) {
      continue;
    }

    bestArea = visibleArea;
    bestRect = {
      left: visibleLeft,
      top: visibleTop,
      width: visibleWidth,
      height: visibleHeight
    };
  }

  return bestRect;
}

function isElementVisibleInViewport(element) {
  if (!(element instanceof Element)) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return false;
  }

  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  return rect.bottom > 0 && rect.right > 0 && rect.left < viewportWidth && rect.top < viewportHeight;
}

function isVideoVisibleOnScreen() {
  return Boolean(getVisibleVideoBounds());
}

function getOverlayBounds() {
  if (!settings.showOnlyWhenVideoVisible) {
    return getViewportBounds();
  }

  return getVisibleVideoBounds();
}

function syncOverlayGeometry() {
  if (!overlayRoot) {
    return;
  }

  const bounds = getOverlayBounds();
  if (!bounds) {
    overlayRoot.classList.add("tco-hidden");
    return;
  }

  overlayRoot.classList.remove("tco-hidden");
  overlayRoot.style.left = `${bounds.left}px`;
  overlayRoot.style.top = `${bounds.top}px`;
  overlayRoot.style.width = `${bounds.width}px`;
  overlayRoot.style.height = `${bounds.height}px`;
  overlayRoot.style.setProperty("--tco-overlay-width", `${bounds.width}px`);
  overlayRoot.style.setProperty("--tco-overlay-height", `${bounds.height}px`);
}

function shouldDisplayOverlay() {
  if (!(settings.enabled && settings.displayMode === "niconico")) {
    return false;
  }

  if (!settings.showOnlyWhenVideoVisible) {
    return true;
  }

  return Boolean(getVisibleVideoBounds());
}

function isOverlayEnabled() {
  return settings.enabled && settings.displayMode === "niconico";
}

function isOverlayVisible() {
  if (!settings.showOnlyWhenVideoVisible) {
    return true;
  }

  return Boolean(getVisibleVideoBounds());
}

function refreshOverlayVisibility() {
  if (!overlayRoot) {
    return;
  }

  syncOverlayGeometry();
  overlayRoot.classList.toggle("tco-hidden", !shouldDisplayOverlay());
}

function ensureViewportVisibilityTracking() {
  if (viewportRefreshAttached) {
    return;
  }

  window.addEventListener("scroll", refreshOverlayVisibility, true);
  window.addEventListener("resize", refreshOverlayVisibility);
  viewportRefreshAttached = true;
}

function applySettings() {
  if (!overlayRoot) {
    return;
  }

  refreshOverlayVisibility();
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

  const videoChatMessageContainer = findVideoChatMessageContainer(node);
  if (videoChatMessageContainer) {
    return videoChatMessageContainer;
  }

  const nestedMessage = node.querySelector(CHAT_SELECTORS.join(", "));
  if (nestedMessage) {
    return nestedMessage;
  }

  // Fallback for layouts where only author attributes are present on descendants.
  // Accept nodes that actually contain message-bearing elements/attributes.
  const dataUserNode = node.matches("[data-a-user]") ? node : node.querySelector("[data-a-user]");
  if (!dataUserNode) {
    return null;
  }

  const messageContainer = dataUserNode.closest(
    [
      ".chat-line__message-container",
      ".chat-line__message",
      "[data-a-target='chat-line-message']",
      "[data-test-selector='chat-line-message']",
      VIDEO_CHAT_MESSAGE_SELECTOR
    ].join(", ")
  ) || dataUserNode.parentElement || dataUserNode;

  const hasMessageBody = Boolean(findFirstMatchingElement(messageContainer, MESSAGE_BODY_SELECTORS));
  const hasMessageTextFragments = findUniqueMatchingElements(messageContainer, MESSAGE_TEXT_SELECTORS).length > 0;
  const accessibleCandidates = [messageContainer, ...Array.from(messageContainer.querySelectorAll("*"))];
  const hasAccessibleText = accessibleCandidates.some((candidateNode) => Boolean(
    normalizeText(candidateNode.getAttribute("aria-label") || "") ||
    normalizeText(candidateNode.getAttribute("title") || "")
  ));

  if (hasMessageBody || hasMessageTextFragments || hasAccessibleText) {
    return messageContainer;
  }

  return null;
}

function findVideoChatMessageContainer(node) {
  const messageBody = node.matches(VIDEO_CHAT_MESSAGE_SELECTOR)
    ? node
    : node.querySelector(VIDEO_CHAT_MESSAGE_SELECTOR);
  if (!messageBody) {
    return null;
  }

  const authorContainer = findFirstMatchingElement(node, AUTHOR_SELECTORS);
  if (!authorContainer && node !== messageBody) {
    return messageBody;
  }

  return node;
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

function parseTimestampCandidate(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsedDate = Date.parse(trimmed);
  if (Number.isFinite(parsedDate)) {
    return parsedDate;
  }

  const parsedNumber = Number(trimmed);
  if (!Number.isFinite(parsedNumber)) {
    return null;
  }

  return parsedNumber < 1e12 ? parsedNumber * 1000 : parsedNumber;
}

function getMessageTimestamp(messageNode) {
  const timestampElement = findFirstMatchingElement(messageNode, MESSAGE_TIMESTAMP_SELECTORS);
  if (!timestampElement) {
    return null;
  }

  return (
    parseTimestampCandidate(timestampElement.getAttribute("datetime")) ||
    parseTimestampCandidate(timestampElement.getAttribute("data-timestamp")) ||
    parseTimestampCandidate(timestampElement.getAttribute("data-created-at")) ||
    parseTimestampCandidate(timestampElement.textContent || "")
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeText(value) {
  return value?.replace(/\s+/g, " ").trim() || "";
}

const URL_TEXT_PATTERN = /(^|[\s([{<"'`])((?:https?:\/\/|www\.)[^\s<>()[\]{}"'`]+)([)\]}>.,!?;:]*)/gi;

function stripUrlsFromText(text) {
  if (!text) {
    return "";
  }

  return normalizeText(text.replace(URL_TEXT_PATTERN, (_match, prefix) => {
    return /\s/.test(prefix || "") ? prefix : "";
  }));
}

function includesAnyKeyword(value, keywords) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) {
    return false;
  }

  return keywords.some((keyword) => normalized.includes(keyword));
}

function hasDataMarkerKeywords(root, keywords) {
  if (!(root instanceof Element)) {
    return false;
  }

  const candidates = [
    root,
    ...Array.from(root.querySelectorAll("[data-test-selector], [data-a-target]"))
  ];
  for (const candidate of candidates) {
    const marker = `${candidate.getAttribute("data-test-selector") || ""} ${candidate.getAttribute("data-a-target") || ""}`;
    if (includesAnyKeyword(marker, keywords)) {
      return true;
    }
  }

  return false;
}

function extractTextWithEmojiSupport(root) {
  if (!(root instanceof Element)) {
    return "";
  }

  const pieces = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let node = walker.currentNode;

  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent) {
        pieces.push(node.textContent);
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node;
      if (element instanceof HTMLImageElement) {
        const alt = normalizeText(element.alt);
        if (alt) {
          pieces.push(` ${alt} `);
        }
      }
    }

    node = walker.nextNode();
  }

  return normalizeText(pieces.join(" "));
}

function getMessageContentRoots(messageNode) {
  const bodyRoots = findUniqueMatchingElements(messageNode, MESSAGE_BODY_SELECTORS);
  if (bodyRoots.length > 0) {
    return bodyRoots;
  }

  const videoRoots = findUniqueMatchingElements(messageNode, [VIDEO_CHAT_MESSAGE_SELECTOR]);
  if (videoRoots.length > 0) {
    return videoRoots;
  }

  return [messageNode];
}

function isMessageEmoteImage(element) {
  if (!(element instanceof HTMLImageElement)) {
    return false;
  }

  if (element.classList.contains("chat-badge")) {
    return false;
  }

  return (
    element.matches(EMOTE_IMAGE_SELECTOR) ||
    Boolean(element.closest(EMOTE_CONTAINER_SELECTOR)) ||
    Boolean(normalizeText(element.alt))
  );
}

function normalizeRenderableParts(parts, author) {
  if (parts.length === 0) {
    return parts;
  }

  const normalized = [];
  let textBuffer = "";

  const flushText = () => {
    if (!textBuffer) {
      return;
    }
    normalized.push({ type: "text", text: textBuffer });
    textBuffer = "";
  };

  for (const part of parts) {
    if (part.type === "text") {
      textBuffer += part.text;
      continue;
    }
    flushText();
    normalized.push(part);
  }
  flushText();

  for (const part of normalized) {
    if (part.type !== "text") {
      continue;
    }
    part.text = stripAuthorPrefix(part.text, author).replace(/^\s+/, "");
    break;
  }

  const cleaned = [];
  for (const part of normalized) {
    if (part.type === "text") {
      const compact = part.text.replace(/\s+/g, " ");
      if (!compact.trim()) {
        continue;
      }
      cleaned.push({ type: "text", text: compact });
      continue;
    }
    cleaned.push(part);
  }

  return cleaned;
}

function normalizeRenderablePartsForUrlVisibility(parts) {
  if (settings.showUrls || parts.length === 0) {
    return parts;
  }

  const cleaned = [];
  for (const part of parts) {
    if (part.type === "text") {
      const text = stripUrlsFromText(part.text);
      if (!text) {
        continue;
      }
      cleaned.push({ ...part, text });
      continue;
    }

    cleaned.push(part);
  }

  return cleaned;
}

function partsToText(parts) {
  const joined = parts
    .map((part) => (part.type === "text" ? part.text : (part.alt || "")))
    .join(" ");
  return normalizeText(joined);
}

function extractChatBadges(messageNode) {
  const badges = [];
  const seen = new Set();

  for (const badge of messageNode.querySelectorAll(CHAT_BADGE_SELECTOR)) {
    if (!(badge instanceof HTMLImageElement)) {
      continue;
    }

    const src = badge.getAttribute("src") || "";
    if (!src) {
      continue;
    }

    const alt = normalizeText(badge.alt || badge.getAttribute("aria-label") || badge.getAttribute("title") || "");
    const key = `${src}\n${alt}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    badges.push({
      alt,
      src,
      srcset: badge.getAttribute("srcset") || ""
    });
  }

  return badges;
}

function extractRenderableParts(root, author) {
  if (!(root instanceof Element)) {
    return [];
  }

  const parts = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let node = walker.currentNode;

  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent) {
        parts.push({ type: "text", text: node.textContent });
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node;
      if (isMessageEmoteImage(element)) {
        const alt = normalizeText(element.alt);
        const src = element.getAttribute("src") || "";
        if (src) {
          parts.push({
            type: "emote",
            alt,
            src,
            srcset: element.getAttribute("srcset") || ""
          });
        }
      }
    }
    node = walker.nextNode();
  }

  return normalizeRenderableParts(parts, author);
}

function stripAuthorPrefix(text, author) {
  let normalizedText = text;
  if (!author) {
    return normalizedText.replace(/^[:：]\s*/, "").trim();
  }

  const authorPrefixPattern = new RegExp(`^${escapeRegExp(author)}\\s*:?\\s*`, "i");
  while (authorPrefixPattern.test(normalizedText)) {
    normalizedText = normalizedText.replace(authorPrefixPattern, "").trim();
  }

  const lowerText = normalizedText.toLowerCase();
  const lowerAuthor = author.toLowerCase();
  const authorIndex = lowerText.indexOf(lowerAuthor);
  if (authorIndex >= 0) {
    const afterAuthor = normalizedText.slice(authorIndex + author.length);
    const separatorMatch = afterAuthor.match(/^\s*[:：]\s*/);
    if (separatorMatch) {
      normalizedText = afterAuthor.slice(separatorMatch[0].length).trim();
    }
  }

  return normalizedText
    .replace(/^[:：]\s*/, "")
    .trim();
}

function normalizeComparableText(value) {
  return normalizeText(value).replace(/^[:：]\s*/, "").replace(/\s*[:：]\s*$/, "").toLowerCase();
}

function isLikelyAuthorOnlyText(author, text) {
  if (!author || !text) {
    return false;
  }

  return normalizeComparableText(author) === normalizeComparableText(text);
}

function isRepeatedAuthorOnlyText(author, text) {
  if (!author || !text) {
    return false;
  }

  const normalizedAuthor = normalizeComparableText(author);
  if (!normalizedAuthor) {
    return false;
  }

  const tokens = normalizeText(text)
    .split(/\s+/)
    .map((token) => normalizeComparableText(token))
    .filter(Boolean);

  return tokens.length > 1 && tokens.every((token) => token === normalizedAuthor);
}

function isAuthorEchoText(author, text) {
  if (!author || !text) {
    return false;
  }

  const normalizedAuthor = normalizeComparableText(author);
  if (!normalizedAuthor) {
    return false;
  }

  const compactText = normalizeText(text).toLowerCase().replace(/[\s:：]+/g, "");
  const compactAuthor = normalizedAuthor.replace(/[\s:：]+/g, "");

  if (!compactAuthor) {
    return false;
  }

  return compactText === compactAuthor || compactText === `${compactAuthor}${compactAuthor}`;
}

function isAuthorOnlyCandidate(authorAliases, text) {
  for (const alias of authorAliases) {
    if (!alias) {
      continue;
    }

    if (
      isAuthorEchoText(alias, text) ||
      isLikelyAuthorOnlyText(alias, text) ||
      isRepeatedAuthorOnlyText(alias, text)
    ) {
      return true;
    }
  }

  return false;
}

function pickBestMessageText(authorAliases, candidates) {
  for (const candidate of candidates) {
    const normalized = normalizeText(candidate.text);
    if (!normalized) {
      continue;
    }
    if (candidate.skipAuthorOnly && isAuthorOnlyCandidate(authorAliases, normalized)) {
      continue;
    }
    return normalized;
  }

  return "";
}

function isInsideAuthorNode(node, messageNode) {
  const authorAncestor = node.closest(AUTHOR_SELECTORS.join(", "));
  return Boolean(authorAncestor && messageNode.contains(authorAncestor));
}

function getTextFromFragments(messageNode) {
  return findUniqueMatchingElements(messageNode, MESSAGE_TEXT_SELECTORS)
    .filter((node) => !isInsideAuthorNode(node, messageNode))
    .map((node) => extractTextWithEmojiSupport(node))
    .filter(Boolean)
    .join(" ")
    .trim();
}

function cloneWithoutAuthorNodes(node) {
  const clone = node.cloneNode(true);
  for (const authorNode of findUniqueMatchingElements(clone, AUTHOR_SELECTORS)) {
    authorNode.remove();
  }

  return clone;
}

function getTextFromNodeWithoutAuthor(node, author) {
  const clone = cloneWithoutAuthorNodes(node);
  return stripAuthorPrefix(extractTextWithEmojiSupport(clone), author);
}

function getTextFromMessageBodies(messageNode) {
  for (const bodyNode of findUniqueMatchingElements(messageNode, MESSAGE_BODY_SELECTORS)) {
    const bodyText = extractTextWithEmojiSupport(cloneWithoutAuthorNodes(bodyNode));
    if (bodyText) {
      return bodyText;
    }
  }

  return "";
}

function getAccessibleMessageText(messageNode, author) {
  const candidates = [
    messageNode,
    ...findUniqueMatchingElements(messageNode, MESSAGE_BODY_SELECTORS),
    ...findUniqueMatchingElements(messageNode, MESSAGE_TEXT_SELECTORS)
  ];

  for (const node of candidates) {
    const ariaLabel = stripAuthorPrefix(normalizeText(node.getAttribute("aria-label") || ""), author);
    if (ariaLabel && !isLikelyAuthorOnlyText(author, ariaLabel)) {
      return ariaLabel;
    }

    const title = stripAuthorPrefix(normalizeText(node.getAttribute("title") || ""), author);
    if (title && !isLikelyAuthorOnlyText(author, title)) {
      return title;
    }
  }

  return "";
}

function getMessageParts(messageNode) {
  const authorNode = findFirstMatchingElement(messageNode, AUTHOR_SELECTORS);
  const displayAuthor = authorNode?.textContent?.trim() || "";
  const loginAuthor = messageNode.getAttribute("data-a-user") || "";
  const author = displayAuthor || loginAuthor;
  const authorAliases = Array.from(new Set([author, displayAuthor, loginAuthor].filter(Boolean)));
  const bodyText = getTextFromMessageBodies(messageNode);
  const fragmentText = getTextFromFragments(messageNode);
  const accessibleText = getAccessibleMessageText(messageNode, author);
  const retryText = getTextFromNodeWithoutAuthor(messageNode, author);
  const text = pickBestMessageText(authorAliases, [
    { text: bodyText, skipAuthorOnly: false },
    { text: fragmentText, skipAuthorOnly: false },
    { text: accessibleText, skipAuthorOnly: true },
    { text: retryText, skipAuthorOnly: true }
  ]);

  const contentRoots = getMessageContentRoots(messageNode);
  let richParts = [];
  for (const contentRoot of contentRoots) {
    richParts = extractRenderableParts(cloneWithoutAuthorNodes(contentRoot), author);
    if (partsToText(richParts)) {
      break;
    }
  }

  const visibleText = settings.showUrls ? text : stripUrlsFromText(text);
  const visibleRichParts = normalizeRenderablePartsForUrlVisibility(richParts);

  return {
    author,
    text: visibleText,
    badges: extractChatBadges(messageNode),
    richParts: visibleRichParts
  };
}

function collectInitialMessageNodes(containers) {
  const nodes = [];
  const seen = new Set();

  for (const container of containers) {
    for (const node of container.querySelectorAll(CHAT_SELECTORS.join(", "))) {
      if (seen.has(node)) {
        continue;
      }

      seen.add(node);
      nodes.push(node);
    }
  }

  const cutoff = Date.now() - INITIAL_MESSAGE_LOOKBACK_MS;
  const recentNodes = nodes.filter((node) => {
    const timestamp = getMessageTimestamp(node);
    return timestamp == null || timestamp >= cutoff;
  });
  const renderLimit = Math.max(1, Math.min(INITIAL_MESSAGE_RENDER_LIMIT, getCurrentRows()));

  if (recentNodes.length <= renderLimit) {
    return recentNodes;
  }

  return recentNodes.slice(-renderLimit);
}

function isSubscriptionNotice(messageNode) {
  if (messageNode.classList.contains("user-notice-line")) {
    return true;
  }

  return hasDataMarkerKeywords(messageNode, ["user-notice", "subscription"]);
}

function isCheerMessage(messageNode) {
  if (findFirstMatchingElement(messageNode, CHEER_AMOUNT_SELECTORS)) {
    return true;
  }

  return hasDataMarkerKeywords(messageNode, ["cheer", "bits"]);
}

function isNightbotMessage(messageNode) {
  const authorNode = findFirstMatchingElement(messageNode, AUTHOR_SELECTORS);
  const displayAuthor = normalizeComparableText(authorNode?.textContent || "");
  const loginAuthor = normalizeComparableText(messageNode.getAttribute("data-a-user") || "");
  const accessibleLabel = normalizeComparableText(messageNode.getAttribute("aria-label") || "");

  return (
    displayAuthor === "nightbot" ||
    loginAuthor === "nightbot" ||
    accessibleLabel.includes("nightbot")
  );
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

function getAnimationClock() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function getViewportWidth() {
  return Math.max(
    document.documentElement?.clientWidth || 0,
    window.innerWidth || 0,
    320
  );
}

function getViewportHeight() {
  return Math.max(
    document.documentElement?.clientHeight || 0,
    window.innerHeight || 0,
    240
  );
}

function getCommentRowHeightPx(commentHeightPx = 0) {
  return Math.max(
    commentHeightPx,
    Math.ceil(settings.fontSize * 1.2),
    24
  ) + 2;
}

function getCurrentRows(commentHeightPx = 0) {
  const overlayHeight = getOverlayBounds()?.height || getViewportHeight();
  const usableHeightPx = Math.max(((settings.verticalEnd - settings.verticalStart) / 100) * overlayHeight, 10);
  const safeRows = Math.floor(usableHeightPx / getCommentRowHeightPx(commentHeightPx));
  return Math.max(1, Math.min(Math.floor(settings.maxRows), safeRows));
}

function getCommentGapPx() {
  return Math.max(settings.fontSize * 1.25, 24);
}

function estimateCommentWidth(comment) {
  const textLength = comment.textContent?.length || 1;
  const emoteCount = comment.querySelectorAll(".tco-emote").length;
  const badgeCount = comment.querySelectorAll(".tco-badge").length;
  return Math.max(
    settings.fontSize * 2,
    textLength * settings.fontSize * 0.72 +
      emoteCount * settings.fontSize * 1.15 +
      badgeCount * settings.fontSize * 0.95
  );
}

function measureCommentWidth(comment) {
  const rectWidth = comment.getBoundingClientRect?.().width || 0;
  return Math.ceil(Math.max(rectWidth, comment.offsetWidth || 0, estimateCommentWidth(comment)));
}

function measureCommentHeight(comment) {
  const rectHeight = comment.getBoundingClientRect?.().height || 0;
  return Math.ceil(Math.max(rectHeight, comment.offsetHeight || 0, getCommentRowHeightPx()));
}

function normalizeRowReservations(rows, now = getAnimationClock()) {
  if (rowReservations.length !== rows) {
    rowReservations = Array.from({ length: rows }, (_value, index) => rowReservations[index] || []);
  }

  for (const row of rowReservations) {
    for (let index = row.length - 1; index >= 0; index -= 1) {
      const reservation = row[index];
      const animationEnded = now - reservation.startTime > reservation.durationMs + 500;
      if (animationEnded || !reservation.element.isConnected) {
        row.splice(index, 1);
      }
    }
  }
}

function getSafeDelayForReservation(reservation, commentWidth, durationMs, now, viewportWidth) {
  const elapsedMs = now - reservation.startTime;
  const existingVelocity = (viewportWidth + reservation.width) / reservation.durationMs;
  const newVelocity = (viewportWidth + commentWidth) / durationMs;
  const currentRightEdge = viewportWidth + reservation.width - existingVelocity * elapsedMs;
  const visibleThreshold = viewportWidth - getCommentGapPx();
  const safeRightEdge = newVelocity > existingVelocity
    ? Math.min(visibleThreshold, visibleThreshold * (existingVelocity / newVelocity))
    : visibleThreshold;

  if (currentRightEdge <= safeRightEdge) {
    return 0;
  }

  return Math.max(0, (currentRightEdge - safeRightEdge) / existingVelocity);
}

function reserveCommentRow(comment, commentWidth, durationMs) {
  const commentHeight = measureCommentHeight(comment);
  const rows = getCurrentRows(commentHeight);
  const now = getAnimationClock();
  const viewportWidth = getOverlayBounds()?.width || getViewportWidth();
  const overlayHeight = getOverlayBounds()?.height || getViewportHeight();
  const usableHeightPx = Math.max(((settings.verticalEnd - settings.verticalStart) / 100) * overlayHeight, 10);
  const rowHeight = Math.max(usableHeightPx / rows, 1);

  normalizeRowReservations(rows, now);
  if (rowReservations.reduce((sum, row) => sum + row.length, 0) < rows) {
    rowCursor = 0;
  }

  let selectedRow = 0;
  let selectedDelayMs = Number.POSITIVE_INFINITY;
  for (let offset = 0; offset < rows; offset += 1) {
    const rowIndex = (rowCursor + offset) % rows;
    const delayMs = rowReservations[rowIndex].reduce((maxDelay, reservation) => (
      Math.max(maxDelay, getSafeDelayForReservation(reservation, commentWidth, durationMs, now, viewportWidth))
    ), 0);

    if (delayMs < selectedDelayMs) {
      selectedRow = rowIndex;
      selectedDelayMs = delayMs;
    }
  }

  const reservation = {
    element: comment,
    width: commentWidth,
    startTime: now + selectedDelayMs,
    durationMs
  };
  rowReservations[selectedRow].push(reservation);
  rowCursor = (selectedRow + 1) % rows;

  return {
    rowIndex: selectedRow,
    top: ((settings.verticalStart / 100) * overlayHeight) + rowHeight * selectedRow,
    delayMs: selectedDelayMs,
    reservation
  };
}

function removeRowReservation(reservation) {
  for (const row of rowReservations) {
    const index = row.indexOf(reservation);
    if (index !== -1) {
      row.splice(index, 1);
      return;
    }
  }
}

function activateComment(comment, rowPlacement, options) {
  if (!contentState.active || ((!isOverlayEnabled() && !options.force) || !isOverlayVisible())) {
    removeRowReservation(rowPlacement.reservation);
    comment.remove();
    return;
  }

  rowPlacement.reservation.startTime = getAnimationClock();
  comment.style.top = `${rowPlacement.top}px`;
  comment.classList.remove("tco-comment--measuring");
  publishDiagnostics({
    lastMessageAt: new Date().toISOString()
  });
}

function displayComment({ author, text }, options = {}) {
  const originalRichParts = options.richParts || [];
  const richParts = settings.showEmotes
    ? originalRichParts
    : originalRichParts.filter((part) => part.type !== "emote");
  const renderedText = settings.showUrls ? text : stripUrlsFromText(text);
  const textFromRichParts = normalizeText(
    richParts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join(" ")
  );
  const renderText = settings.showEmotes
    ? renderedText
    : (originalRichParts.length > 0 ? textFromRichParts : renderedText);

  if (((!isOverlayEnabled() && !options.force) || !isOverlayVisible()) || (richParts.length === 0 && !renderText.trim())) {
    return;
  }

  const root = createOverlay();
  const comment = document.createElement("div");
  comment.className = "tco-comment tco-comment--measuring";
  const durationMs = settings.speed * 1000;
  comment.style.animationDuration = `${settings.speed}s`;

  if (settings.showBadges && options.badges?.length) {
    for (const badgePart of options.badges) {
      const badge = document.createElement("img");
      badge.className = "tco-badge";
      badge.alt = badgePart.alt || "";
      badge.src = badgePart.src;
      if (badgePart.srcset) {
        badge.setAttribute("srcset", badgePart.srcset);
      }
      comment.appendChild(badge);
    }
  }

  if (settings.showUsernames && author) {
    const authorElement = document.createElement("strong");
    authorElement.textContent = author;
    comment.appendChild(authorElement);
  }

  if (settings.showEmotes && richParts.length > 0) {
    for (const part of richParts) {
      if (part.type === "text") {
        comment.append(document.createTextNode(part.text));
        continue;
      }

      const emote = document.createElement("img");
      emote.className = "tco-emote";
      emote.alt = part.alt || "";
      emote.src = part.src;
      if (part.srcset) {
        emote.setAttribute("srcset", part.srcset);
      }
      comment.appendChild(emote);
    }
  } else if (renderText.trim()) {
    comment.append(document.createTextNode(renderText));
  } else {
    return;
  }
  root.appendChild(comment);
  const rowPlacement = reserveCommentRow(comment, measureCommentWidth(comment), durationMs);

  if (rowPlacement.delayMs > 0) {
    const timer = window.setTimeout(() => {
      queuedCommentTimers.delete(timer);
      activateComment(comment, rowPlacement, options);
    }, rowPlacement.delayMs);
    queuedCommentTimers.add(timer);
  } else {
    activateComment(comment, rowPlacement, options);
  }

  comment.addEventListener("animationend", () => {
    removeRowReservation(rowPlacement.reservation);
    comment.remove();
    if (options.force) {
      applySettings();
    }
  }, { once: true });
}

function handlePotentialMessage(node) {
  if (settings.displayMode !== "niconico") {
    return;
  }

  const messageNode = findChatMessageNode(node);
  if (!messageNode) {
    return;
  }

  const message = getMessageParts(messageNode);
  if (!message.text || seenMessages.has(messageNode)) {
    return;
  }

  if (settings.hideSubscriptions && isSubscriptionNotice(messageNode)) {
    return;
  }

  if (settings.hideCheers && isCheerMessage(messageNode)) {
    return;
  }

  if (settings.hideNightbot && isNightbotMessage(messageNode)) {
    return;
  }

  seenMessages.add(messageNode);
  diagnostics.matchedMessageCount += 1;
  if (isDuplicate(message.author, message.text)) {
    return;
  }

  displayComment(message, {
    badges: message.badges,
    richParts: message.richParts
  });
}

function rememberExistingMessageNodes(containers) {
  for (const node of collectInitialMessageNodes(containers)) {
    const messageNode = findChatMessageNode(node);
    if (messageNode) {
      seenMessages.add(messageNode);
    }
  }
}

function resetCommentRenderingState() {
  rowCursor = 0;
  rowReservations = [];
  recentSignatures.clear();

  for (const timer of queuedCommentTimers) {
    window.clearTimeout(timer);
  }
  queuedCommentTimers.clear();
}

function clearOverlayContent() {
  overlayRoot?.replaceChildren();
  resetCommentRenderingState();
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
  }

  rememberExistingMessageNodes(containers);

  publishDiagnostics({
    observerMode: "chat-container",
    chatContainerCount: containers.length
  });
}

function restartChatObservation() {
  observeChat();
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

    const wasOverlayVisible = shouldDisplayOverlay();
    settings = normalizeSettings(nextSettings);
    applySettings();

    if (wasOverlayVisible && !shouldDisplayOverlay()) {
      clearOverlayContent();
    }

    if (hasOwn(changes, "enabled") || hasOwn(changes, "displayMode")) {
      seenMessages = new WeakSet();
      resetCommentRenderingState();
      restartChatObservation();
    }
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
      refreshOverlayVisibility();
      return;
    }

    currentUrl = location.href;
    seenMessages = new WeakSet();
    resetCommentRenderingState();
    observeChat();
  }, 1000);

  loadSettings();
}
})();

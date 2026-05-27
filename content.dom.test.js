// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";

const settingsSource = readFileSync(join(process.cwd(), "settings.js"), "utf8");
const contentSource = readFileSync(join(process.cwd(), "content.js"), "utf8");

function evaluateScript(source) {
  (0, eval)(source);
}

function setupChromeStub(settingsPatch = {}) {
  globalThis.chrome = {
    runtime: {
      id: "test-extension",
      getURL: vi.fn(() => ""),
      onMessage: {
        addListener: vi.fn()
      }
    },
    storage: {
      local: {
        get: vi.fn((_keys, callback) => {
          callback({
            ...globalThis.TCO_SETTINGS.DEFAULT_SETTINGS,
            showUsernames: false,
            ...settingsPatch
          });
        }),
        set: vi.fn((_values, callback) => {
          callback?.();
        })
      },
      sync: {
        get: vi.fn((defaults, callback) => {
          callback(defaults);
        })
      },
      onChanged: {
        addListener: vi.fn()
      }
    }
  };
}

function loadContentScript(settingsPatch) {
  evaluateScript(settingsSource);
  setupChromeStub(settingsPatch);
  evaluateScript(contentSource);
}

function createChatContainer() {
  const container = document.createElement("div");
  container.setAttribute("data-a-target", "chat-scroller");
  document.body.appendChild(container);
  return container;
}

function createMessage({ author = "Alice", body } = {}) {
  const message = document.createElement("div");
  message.setAttribute("data-a-target", "chat-line-message");
  message.setAttribute("data-a-user", author);

  const authorNode = document.createElement("span");
  authorNode.setAttribute("data-a-target", "chat-message-username");
  authorNode.textContent = author;
  message.appendChild(authorNode);

  if (body) {
    message.appendChild(body);
  }

  return message;
}

function createTimestampedMessage({ author = "Alice", body, timestamp } = {}) {
  const message = createMessage({ author, body });
  if (timestamp) {
    const time = document.createElement("time");
    time.setAttribute("datetime", timestamp);
    time.textContent = timestamp;
    message.appendChild(time);
  }

  return message;
}

function createBody(children) {
  const body = document.createElement("span");
  body.setAttribute("data-a-target", "chat-line-message-body");
  body.append(...children);
  return body;
}

function createTextFragment(text) {
  const fragment = document.createElement("span");
  fragment.className = "text-fragment";
  fragment.textContent = text;
  return fragment;
}

function createEmote(alt) {
  const emote = document.createElement("img");
  emote.alt = alt;
  emote.className = "chat-image chat-line__message--emote";
  emote.src = `https://static-cdn.jtvnw.net/emoticons/v2/${alt}/static/light/1.0`;
  return emote;
}

function createBadge(alt) {
  const badge = document.createElement("img");
  badge.alt = alt;
  badge.className = "chat-badge";
  badge.src = `https://static-cdn.jtvnw.net/badges/v1/${alt}/1`;
  return badge;
}

function createVideoElement(rect) {
  const video = document.createElement("video");
  Object.defineProperty(video, "getBoundingClientRect", {
    value: () => rect
  });
  document.body.appendChild(video);
  return video;
}

function displayedComments() {
  return Array.from(document.querySelectorAll(".tco-comment"), (comment) => comment.textContent);
}

function displayedBadges() {
  return Array.from(document.querySelectorAll(".tco-comment .tco-badge"), (badge) => ({
    alt: badge.getAttribute("alt") || "",
    src: badge.getAttribute("src") || ""
  }));
}

function displayedEmotes() {
  return Array.from(document.querySelectorAll(".tco-comment .tco-emote"), (emote) => ({
    alt: emote.getAttribute("alt") || "",
    src: emote.getAttribute("src") || ""
  }));
}

function waitForMutationObserver() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function getStorageChangeListener() {
  return globalThis.chrome.storage.onChanged.addListener.mock.calls[0]?.[0];
}

beforeEach(() => {
  Object.defineProperty(window, "innerHeight", {
    value: 1080,
    configurable: true
  });
  globalThis.TCO_CONTENT_STATE?.cleanup?.();
  delete globalThis.TCO_CONTENT_STATE;
  delete globalThis.TCO_CONTENT_READY;
  delete globalThis.TCO_SETTINGS;
  delete globalThis.chrome;
  document.body.innerHTML = "";
});

afterEach(() => {
  globalThis.TCO_CONTENT_STATE?.cleanup?.();
});

test("renders emotes as images for mixed Twitch message bodies", async () => {
  const container = createChatContainer();
  loadContentScript();

  container.appendChild(createMessage({
    body: createBody([
      createTextFragment("hello"),
      createEmote("Kappa")
    ])
  }));
  await waitForMutationObserver();

  expect(displayedComments()).toEqual(["hello"]);
  expect(displayedEmotes()).toEqual([
    expect.objectContaining({ alt: "Kappa" })
  ]);
});

test("strips URLs from messages when showUrls is disabled", async () => {
  const container = createChatContainer();
  loadContentScript({ showUrls: false });

  container.appendChild(createMessage({
    body: createBody([
      createTextFragment("check https://example.com please")
    ])
  }));
  await waitForMutationObserver();

  expect(displayedComments()).toEqual(["check please"]);
});

test("strips wrapped URLs from messages when showUrls is disabled", async () => {
  const container = createChatContainer();
  loadContentScript({ showUrls: false });

  container.appendChild(createMessage({
    body: createBody([
      createTextFragment("visit <https://example.com> and https://example.org.")
    ])
  }));
  await waitForMutationObserver();

  expect(displayedComments()).toEqual(["visit and"]);
});

test("keeps targeted message text that equals the author's display name", async () => {
  const container = createChatContainer();
  loadContentScript();

  container.appendChild(createMessage({
    author: "Alice",
    body: createBody([
      createTextFragment("Alice")
    ])
  }));
  await waitForMutationObserver();

  expect(displayedComments()).toEqual(["Alice"]);
});

test("renders Twitch chat badges when enabled", async () => {
  const container = createChatContainer();
  loadContentScript({ showBadges: true });

  const message = createMessage({
    body: createBody([
      createTextFragment("hello")
    ])
  });
  message.prepend(createBadge("moderator"));

  container.appendChild(message);
  await waitForMutationObserver();

  expect(displayedComments()).toEqual(["hello"]);
  expect(displayedBadges()).toEqual([
    expect.objectContaining({ alt: "moderator" })
  ]);
});

test("does not render Twitch chat badges when disabled", async () => {
  const container = createChatContainer();
  loadContentScript({ showBadges: false });

  const message = createMessage({
    body: createBody([
      createTextFragment("hello")
    ])
  });
  message.prepend(createBadge("subscriber"));

  container.appendChild(message);
  await waitForMutationObserver();

  expect(displayedComments()).toEqual(["hello"]);
  expect(displayedBadges()).toEqual([]);
});

test("does not enable coming soon styles by default", () => {
  loadContentScript();

  expect(document.documentElement.classList.contains("tco-fullscreen-plus-enabled")).toBe(false);
  expect(document.getElementById("tco-fullscreen-plus-style")).toBeNull();
});

test("keeps the coming soon display mode as a no-op", async () => {
  loadContentScript({ displayMode: "comingSoon" });

  expect(document.documentElement.classList.contains("tco-fullscreen-plus-enabled")).toBe(false);
  expect(document.getElementById("tco-fullscreen-plus-style")).toBeNull();

  const container = createChatContainer();
  container.appendChild(createMessage({
    body: createBody([
      createTextFragment("coming soon native chat only")
    ])
  }));
  await waitForMutationObserver();

  expect(displayedComments()).toEqual([]);
  expect(document.documentElement.classList.contains("tco-fullscreen-plus-enabled")).toBe(false);
});

test("does not render existing chat messages on startup", async () => {
  const container = createChatContainer();

  for (let index = 0; index < 30; index += 1) {
    container.appendChild(createMessage({
      body: createBody([
        createTextFragment(`message ${index}`)
      ])
    }));
  }

  loadContentScript();

  expect(displayedComments()).toEqual([]);

  container.appendChild(createMessage({
    body: createBody([
      createTextFragment("new message")
    ])
  }));
  await waitForMutationObserver();

  expect(displayedComments()).toEqual(["new message"]);
});

test("marks recent startup messages as seen without displaying them", async () => {
  const container = createChatContainer();
  const now = Date.now();
  const older = new Date(now - 2000).toISOString();
  const recent = new Date(now - 500).toISOString();

  for (let index = 0; index < 4; index += 1) {
    container.appendChild(createTimestampedMessage({
      body: createBody([
        createTextFragment(`old ${index}`)
      ]),
      timestamp: older
    }));
  }

  for (let index = 0; index < 2; index += 1) {
    container.appendChild(createTimestampedMessage({
      body: createBody([
        createTextFragment(`recent ${index}`)
      ]),
      timestamp: recent
    }));
  }

  loadContentScript();

  expect(displayedComments()).toEqual([]);

  container.appendChild(createTimestampedMessage({
    body: createBody([
      createTextFragment("after startup")
    ]),
    timestamp: new Date().toISOString()
  }));
  await waitForMutationObserver();

  expect(displayedComments()).toEqual(["after startup"]);
});

test("does not replay existing messages when comments are enabled after startup", async () => {
  const container = createChatContainer();
  loadContentScript({ enabled: false });

  container.appendChild(createMessage({
    body: createBody([
      createTextFragment("existing while disabled")
    ])
  }));
  await waitForMutationObserver();

  const onChanged = getStorageChangeListener();
  onChanged({
    enabled: {
      newValue: true,
      oldValue: false
    }
  }, "local");

  expect(displayedComments()).toEqual([]);

  container.appendChild(createMessage({
    body: createBody([
      createTextFragment("new after enable")
    ])
  }));
  await waitForMutationObserver();

  expect(displayedComments()).toEqual(["new after enable"]);
});

test("clears visible comments when toggling comments off then on", async () => {
  const container = createChatContainer();
  loadContentScript();

  container.appendChild(createMessage({
    body: createBody([
      createTextFragment("before off")
    ])
  }));
  await waitForMutationObserver();

  expect(displayedComments()).toEqual(["before off"]);

  const onChanged = getStorageChangeListener();
  onChanged({
    enabled: {
      newValue: false,
      oldValue: true
    }
  }, "local");

  expect(displayedComments()).toEqual([]);

  onChanged({
    enabled: {
      newValue: true,
      oldValue: false
    }
  }, "local");

  expect(displayedComments()).toEqual([]);

  container.appendChild(createMessage({
    body: createBody([
      createTextFragment("after on")
    ])
  }));
  await waitForMutationObserver();

  expect(displayedComments()).toEqual(["after on"]);
});

test("resets the row cursor when the layout is not full", async () => {
  const container = createChatContainer();
  loadContentScript({ maxRows: 3 });

  container.appendChild(createMessage({
    body: createBody([
      createTextFragment("first")
    ])
  }));
  await waitForMutationObserver();

  const firstComment = document.querySelector(".tco-comment");
  expect(firstComment).not.toBeNull();
  expect(firstComment.style.top).toBe("54px");

  firstComment.dispatchEvent(new Event("animationend"));
  await waitForMutationObserver();

  container.appendChild(createMessage({
    body: createBody([
      createTextFragment("second")
    ])
  }));
  await waitForMutationObserver();

  const comments = Array.from(document.querySelectorAll(".tco-comment"));
  expect(comments.at(-1).style.top).toBe("54px");
});

test("ignores author-only fallback nodes without message text", async () => {
  const container = createChatContainer();
  loadContentScript();

  container.appendChild(createMessage({ author: "Alice" }));
  await waitForMutationObserver();

  expect(displayedComments()).toEqual([]);
});

test("extracts fallback text from data-a-user rows without Twitch text selectors", async () => {
  const container = createChatContainer();
  loadContentScript();

  const message = createMessage({ author: "Alice" });
  const fallbackText = document.createElement("span");
  fallbackText.textContent = "VOD replay comment";
  message.appendChild(fallbackText);

  container.appendChild(message);
  await waitForMutationObserver();

  expect(displayedComments()).toEqual(["VOD replay comment"]);
});

test("extracts VOD video-chat messages when author and body are sibling nodes", async () => {
  const container = createChatContainer();
  loadContentScript();

  const row = document.createElement("div");

  const badgeWrapper = document.createElement("span");
  const badge = document.createElement("img");
  badge.className = "chat-badge";
  badge.alt = "cheer 1万";
  badge.setAttribute("aria-label", "cheer 1万バッジ");
  badgeWrapper.appendChild(badge);
  row.appendChild(badgeWrapper);

  const authorLink = document.createElement("a");
  authorLink.className = "video-chat__message-author";
  authorLink.href = "/banapu_";
  const authorDisplayName = document.createElement("span");
  authorDisplayName.className = "chat-author__display-name";
  authorDisplayName.setAttribute("data-a-target", "chat-message-username");
  authorDisplayName.setAttribute("data-a-user", "banapu_");
  authorDisplayName.textContent = "せおなっぷれ";
  authorLink.appendChild(authorDisplayName);
  row.appendChild(authorLink);

  const message = document.createElement("div");
  message.className = "video-chat__message";
  const separator = document.createElement("span");
  separator.textContent = ":";
  message.appendChild(separator);
  const emote = document.createElement("img");
  emote.alt = "sekiRun";
  emote.className = "chat-image chat-line__message--emote";
  emote.src = "https://static-cdn.jtvnw.net/emoticons/v2/example/static/light/1.0";
  message.appendChild(emote);
  message.appendChild(createTextFragment(" "));
  message.appendChild(createTextFragment("げ。"));
  row.appendChild(message);

  container.appendChild(row);
  await waitForMutationObserver();

  expect(displayedComments()[0].trim()).toBe("げ。");
  expect(displayedEmotes()).toEqual([
    expect.objectContaining({ alt: "sekiRun" })
  ]);
});

test("does not persist extracted chat text in diagnostics", async () => {
  const container = createChatContainer();
  loadContentScript();

  container.appendChild(createMessage({
    body: createBody([
      createTextFragment("private message"),
      createEmote("Kappa")
    ])
  }));
  await waitForMutationObserver();

  const storedDiagnostics = globalThis.chrome.storage.local.set.mock.calls
    .map(([value]) => value.tcoDiagnostics)
    .filter(Boolean);
  expect(storedDiagnostics.length).toBeGreaterThan(0);
  expect(JSON.stringify(storedDiagnostics)).not.toContain("private message");
  expect(JSON.stringify(storedDiagnostics)).not.toContain("Kappa");
});

test("hides subscription notice lines when hideSubscriptions is enabled", async () => {
  const container = createChatContainer();
  loadContentScript({ hideSubscriptions: true });

  const message = createMessage({
    body: createBody([
      createTextFragment("Alice subscribed at Tier 1.")
    ])
  });
  message.classList.add("user-notice-line");

  container.appendChild(message);
  await waitForMutationObserver();

  expect(displayedComments()).toEqual([]);
});

test("hides cheer messages when hideCheers is enabled", async () => {
  const container = createChatContainer();
  loadContentScript({ hideCheers: true });

  const message = createMessage({
    body: createBody([
      createTextFragment("Cheered 100 bits!")
    ])
  });
  const cheerAmount = document.createElement("span");
  cheerAmount.className = "chat-line__message--cheer-amount";
  cheerAmount.textContent = "100";
  message.appendChild(cheerAmount);

  container.appendChild(message);
  await waitForMutationObserver();

  expect(displayedComments()).toEqual([]);
});

test("hides Nightbot messages when hideNightbot is enabled", async () => {
  const container = createChatContainer();
  loadContentScript({ hideNightbot: true });

  container.appendChild(createMessage({
    author: "Nightbot",
    body: createBody([
      createTextFragment("Automated reminder")
    ])
  }));
  await waitForMutationObserver();

  expect(displayedComments()).toEqual([]);
});

test("does not hide normal tier chat when subscription filter is enabled", async () => {
  const container = createChatContainer();
  loadContentScript({ hideSubscriptions: true });

  container.appendChild(createMessage({
    body: createBody([
      createTextFragment("S tier play")
    ])
  }));
  await waitForMutationObserver();

  expect(displayedComments()).toEqual(["S tier play"]);
});

test("does not hide normal gifted chat when subscription filter is enabled", async () => {
  const container = createChatContainer();
  loadContentScript({ hideSubscriptions: true });

  container.appendChild(createMessage({
    body: createBody([
      createTextFragment("who gifted you that?")
    ])
  }));
  await waitForMutationObserver();

  expect(displayedComments()).toEqual(["who gifted you that?"]);
});

test("does not hide normal cheer chat when cheer filter is enabled", async () => {
  const container = createChatContainer();
  loadContentScript({ hideCheers: true });

  container.appendChild(createMessage({
    body: createBody([
      createTextFragment("cheer up")
    ])
  }));
  await waitForMutationObserver();

  expect(displayedComments()).toEqual(["cheer up"]);
});

test("does not hide normal bits chat when cheer filter is enabled", async () => {
  const container = createChatContainer();
  loadContentScript({ hideCheers: true });

  container.appendChild(createMessage({
    body: createBody([
      createTextFragment("bits of lag")
    ])
  }));
  await waitForMutationObserver();

  expect(displayedComments()).toEqual(["bits of lag"]);
});

test("hides comments when the video area is off screen and the visibility setting is enabled", async () => {
  const container = createChatContainer();
  createVideoElement({
    top: 1200,
    left: 0,
    right: 1280,
    bottom: 1360,
    width: 1280,
    height: 160
  });
  loadContentScript({ showOnlyWhenVideoVisible: true });

  container.appendChild(createMessage({
    body: createBody([
      createTextFragment("not visible")
    ])
  }));
  await waitForMutationObserver();

  expect(displayedComments()).toEqual([]);
  expect(document.querySelector("#tco-overlay-root")?.classList.contains("tco-hidden")).toBe(true);
});

test("limits the overlay to the visible video area when the visibility setting is enabled", async () => {
  const container = createChatContainer();
  createVideoElement({
    top: 12,
    left: 24,
    right: 824,
    bottom: 462,
    width: 800,
    height: 450
  });
  loadContentScript({ showOnlyWhenVideoVisible: true });

  container.appendChild(createMessage({
    body: createBody([
      createTextFragment("visible")
    ])
  }));
  await waitForMutationObserver();

  expect(displayedComments()).toEqual(["visible"]);
  const overlayRoot = document.querySelector("#tco-overlay-root");
  expect(overlayRoot?.classList.contains("tco-hidden")).toBe(false);
  expect(overlayRoot?.style.left).toBe("24px");
  expect(overlayRoot?.style.top).toBe("12px");
  expect(overlayRoot?.style.width).toBe("800px");
  expect(overlayRoot?.style.height).toBe("450px");
});

test("hides emote-only messages when showEmotes is disabled", async () => {
  const container = createChatContainer();
  loadContentScript({ showEmotes: false });

  container.appendChild(createMessage({
    body: createBody([
      createEmote("Kappa")
    ])
  }));
  await waitForMutationObserver();

  expect(displayedComments()).toEqual([]);
  expect(displayedEmotes()).toEqual([]);
});

test("keeps only text for mixed messages when showEmotes is disabled", async () => {
  const container = createChatContainer();
  loadContentScript({ showEmotes: false });

  container.appendChild(createMessage({
    body: createBody([
      createTextFragment("hello"),
      createEmote("Kappa"),
      createTextFragment("world")
    ])
  }));
  await waitForMutationObserver();

  expect(displayedComments().map((text) => text.replace(/\s+/g, " ").trim())).toEqual(["hello world"]);
  expect(displayedEmotes()).toEqual([]);
});

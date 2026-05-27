(() => {
  const DEFAULT_LANGUAGE = "en";
  const SUPPORTED_LANGUAGES = ["en", "ja"];
  const DEFAULT_DISPLAY_MODE = "niconico";
  const SUPPORTED_DISPLAY_MODES = ["niconico", "comingSoon"];

  const DEFAULT_SETTINGS = {
    enabled: true,
    language: DEFAULT_LANGUAGE,
    displayMode: DEFAULT_DISPLAY_MODE,
    fontSize: 25,
    speed: 10,
    opacity: 80,
    maxRows: 12,
    verticalStart: 5,
    verticalEnd: 35,
    showUsernames: false,
    showBadges: false,
    showEmotes: true,
    showUrls: true,
    hideSubscriptions: true,
    hideCheers: true,
    hideNightbot: false,
    showOnlyWhenVideoVisible: false
  };

  const CONTENT_RANGES = {
    fontSize: [16, 56],
    speed: [5, 24],
    opacity: [20, 100],
    maxRows: [1, 20],
    verticalStart: [0, 95],
    verticalEnd: [5, 100]
  };

  const POPUP_RANGES = {
    fontSize: [16, 56],
    speed: [5, 24],
    opacity: [20, 100],
    maxRows: [3, 20],
    verticalStart: [0, 90],
    verticalEnd: [10, 100]
  };

  const I18N = {
    en: {
      common: {
        fontSizeUnit: "px",
        speedUnit: "s",
        maxRowsUnit: "rows",
        monitoringDisconnected: "Monitoring status: disconnected",
        monitoringConnected: "Monitoring status: connected to live chat",
        monitoringScanning: "Monitoring status: scanning the page",
        detectedMessages: "Detected messages",
        lastMessage: "Last message",
        noneYet: "none yet",
        couldNotGetActiveTab: "Could not get the active tab",
        openTwitchPage: "Open this on a Twitch watch page",
        sendingTestMessage: "Sending test message...",
        testFailed: "Test failed"
      },
      popup: {
        pageTitle: "Twitch Comment Overlay",
        headerTitle: "Twitch Comment Overlay",
        language: "Language",
        languageHelp: "Choose the language used in the popup",
        english: "English (英語)",
        japanese: "Japanese (日本語)",
        enableOverlay: "Enable overlay",
        generalSettings: "General settings",
        displayMode: "Display format",
        displayModeHelp: "Choose which feature to configure below",
        niconicoComments: "Niconico-style comments",
        niconicoCommentsHelp: "Flow Twitch chat comments across the video",
        comingSoonMode: "COmmingSoon",
        comingSoonModeHelp: "This feature is not available yet",
        displaySettings: "Display settings",
        displayTweaks: "Display tweaks",
        fontSize: "Font size",
        commentDuration: "Comment duration",
        opacity: "Opacity",
        rows: "Rows",
        displayArea: "Display area",
        topPosition: "Top position",
        bottomPosition: "Bottom position",
        displayContent: "Display content",
        messageFilters: "Message filters",
        showUsernames: "Show usernames",
        showBadges: "Show badges",
        showEmotes: "Show emotes",
        showUrls: "Show URLs",
        hideSubscriptions: "Hide subscription messages",
        hideCheers: "Hide cheer messages",
        hideNightbot: "Hide Nightbot messages",
        showOnlyWhenVideoVisible: "Show only over the video area",
        showOnlyWhenVideoVisibleHelp: "Uses the player area as the comment display area",
        hideNightbotHelp: "Hides messages sent by Nightbot",
        testOverlay: "Test overlay",
        status: "Status",
        waitingConnection: "Waiting for connection"
      },
      options: {
        pageTitle: "Twitch Comment Overlay Settings",
        headerTitle: "Twitch Comment Overlay Settings",
        language: "Language",
        languageHelp: "Choose the language used in the popup and options page",
        english: "English (英語)",
        japanese: "Japanese (日本語)",
        enableOverlay: "Enable overlay",
        displayMode: "Display format",
        displayModeHelp: "Changing this switches the settings shown below by feature",
        niconicoComments: "Niconico-style comments",
        niconicoCommentsHelp: "Flow Twitch chat comments across the video",
        comingSoonMode: "COmmingSoon",
        comingSoonModeHelp: "This feature is not available yet",
        fontSize: "Font size",
        fontSizeHelp: "Adjusts the size of comment text",
        commentDuration: "Comment duration",
        commentDurationHelp: "How long a comment stays on screen",
        opacity: "Opacity",
        opacityHelp: "Controls the transparency of the overlay",
        rows: "Rows",
        rowsHelp: "Maximum number of rows shown at once",
        topPosition: "Top position",
        topPositionHelp: "Top edge of the display area as a percentage from the top",
        bottomPosition: "Bottom position",
        bottomPositionHelp: "Bottom edge of the display area as a percentage from the top",
        showUsernames: "Show usernames",
        showUsernamesHelp: "Displays the sender name before each comment",
        showBadges: "Show badges",
        showBadgesHelp: "Displays Twitch badges near the sender name",
        showEmotes: "Show emotes",
        showEmotesHelp: "Displays emote images found in chat messages",
        showUrls: "Show URLs",
        showUrlsHelp: "Displays URLs found in chat messages",
        hideSubscriptions: "Hide subscription messages",
        hideSubscriptionsHelp: "Hides subscription notification comments",
        hideCheers: "Hide cheer messages",
        hideCheersHelp: "Hides comments with Cheers (Bits)",
        hideNightbot: "Hide Nightbot messages",
        showOnlyWhenVideoVisible: "Show only over the video area",
        showOnlyWhenVideoVisibleHelp: "Uses the player area as the comment display area",
        hideNightbotHelp: "Hides messages sent by Nightbot",
        comingSoonMode: "COmmingSoon",
        comingSoonModeHelp: "This feature is not available yet",
        resetToDefaults: "Reset to defaults",
        saved: "Saved",
        restoredDefaults: "Restored default settings"
      }
    },
    ja: {
      common: {
        fontSizeUnit: "px",
        speedUnit: "秒",
        maxRowsUnit: "行",
        monitoringDisconnected: "監視状態: 未接続",
        monitoringConnected: "監視状態: 配信チャットに接続中",
        monitoringScanning: "監視状態: ページを探索中",
        detectedMessages: "検出コメント数",
        lastMessage: "最終コメント",
        noneYet: "まだありません",
        couldNotGetActiveTab: "アクティブなタブを取得できません",
        openTwitchPage: "Twitch の配信ページで開いてください",
        sendingTestMessage: "表示テストを送信中...",
        testFailed: "表示テスト失敗"
      },
      popup: {
        pageTitle: "Twitch Comment Overlay",
        headerTitle: "Twitch Comment Overlay",
        language: "言語",
        languageHelp: "ポップアップに表示する言語を選択します",
        english: "English（英語）",
        japanese: "Japanese（日本語）",
        enableOverlay: "表示を有効にする",
        generalSettings: "基本設定",
        displayMode: "表示形式",
        displayModeHelp: "以下で設定する機能を選択します",
        niconicoComments: "ニコニコ風コメント表示",
        niconicoCommentsHelp: "Twitch チャットを動画上に横流し表示します",
        comingSoonMode: "COmmingSoon",
        comingSoonModeHelp: "この機能はまだ利用できません",
        displaySettings: "表示設定",
        displayTweaks: "表示調整",
        fontSize: "文字サイズ",
        commentDuration: "コメント表示秒数",
        opacity: "透明度",
        rows: "表示行数",
        displayArea: "表示エリア",
        topPosition: "上端位置",
        bottomPosition: "下端位置",
        displayContent: "表示内容",
        messageFilters: "メッセージ除外",
        showUsernames: "ユーザー名を表示",
        showBadges: "バッジを表示",
        showEmotes: "スタンプを表示",
        showUrls: "URL を表示",
        hideSubscriptions: "サブスクを表示しない",
        hideCheers: "チアーを表示しない",
        hideNightbot: "Nightbot を表示しない",
        showOnlyWhenVideoVisible: "動画エリアの上だけに表示",
        showOnlyWhenVideoVisibleHelp: "コメントの表示領域を Twitch プレイヤーの範囲に限定します",
        testOverlay: "表示テスト",
        status: "状態",
        waitingConnection: "接続待ち"
      },
      options: {
        pageTitle: "Twitch Comment Overlay 設定",
        headerTitle: "Twitch Comment Overlay 設定",
        language: "言語",
        languageHelp: "ポップアップと設定画面に表示する言語を選択します",
        english: "English（英語）",
        japanese: "Japanese（日本語）",
        enableOverlay: "表示を有効にする",
        displayMode: "表示形式",
        displayModeHelp: "この設定を変えると、以降の設定項目が機能単位で切り替わります",
        niconicoComments: "ニコニコ風コメント表示",
        niconicoCommentsHelp: "Twitch チャットを動画上に横流し表示します",
        comingSoonMode: "COmmingSoon",
        comingSoonModeHelp: "この機能はまだ利用できません",
        fontSize: "文字サイズ",
        fontSizeHelp: "コメント文字の大きさを調整します",
        commentDuration: "コメント表示秒数",
        commentDurationHelp: "コメントが画面に表示される秒数です",
        opacity: "透明度",
        opacityHelp: "オーバーレイ全体の透け具合です",
        rows: "表示行数",
        rowsHelp: "同時に流れる行の最大数です",
        topPosition: "上端位置",
        topPositionHelp: "表示エリアの上端（画面上からの割合）",
        bottomPosition: "下端位置",
        bottomPositionHelp: "表示エリアの下端（画面上からの割合）",
        showUsernames: "ユーザー名を表示",
        showUsernamesHelp: "コメント先頭に投稿者名を表示します",
        showBadges: "バッジを表示",
        showBadgesHelp: "投稿者名付近に表示される Twitch バッジを表示します",
        showEmotes: "スタンプを表示",
        showEmotesHelp: "チャット内のスタンプ画像を表示します",
        showUrls: "URL を表示",
        showUrlsHelp: "チャットメッセージ内の URL を表示します",
        hideSubscriptions: "サブスクを表示しない",
        hideSubscriptionsHelp: "サブスク通知コメントを非表示にします",
        hideCheers: "チアーを表示しない",
        hideCheersHelp: "チアー（Bits）付きコメントを非表示にします",
        hideNightbot: "Nightbot を表示しない",
        hideNightbotHelp: "Nightbot が投稿したコメントを非表示にします",
        showOnlyWhenVideoVisible: "動画エリアの上だけに表示",
        showOnlyWhenVideoVisibleHelp: "コメントの表示領域を Twitch プレイヤーの範囲に限定します",
        comingSoonMode: "COmmingSoon",
        comingSoonModeHelp: "この機能はまだ利用できません",
        resetToDefaults: "デフォルトに戻す",
        saved: "保存しました",
        restoredDefaults: "デフォルト設定に戻しました"
      }
    }
  };

  const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS);

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeNumber(value, fallback, min, max) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return fallback;
    }

    return clamp(numericValue, min, max);
  }

  function normalizeBoolean(value, fallback) {
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "string") {
      const normalizedValue = value.trim().toLowerCase();
      if (["true", "1", "yes", "on"].includes(normalizedValue)) {
        return true;
      }
      if (["false", "0", "no", "off", ""].includes(normalizedValue)) {
        return false;
      }
    }

    if (typeof value === "number") {
      return value !== 0;
    }

    return fallback;
  }

  function normalizeLanguage(value, fallback = DEFAULT_LANGUAGE) {
    if (typeof value === "string") {
      const normalizedValue = value.trim().toLowerCase();
      if (SUPPORTED_LANGUAGES.includes(normalizedValue)) {
        return normalizedValue;
      }
    }

    return SUPPORTED_LANGUAGES.includes(fallback) ? fallback : DEFAULT_LANGUAGE;
  }

  function normalizeDisplayMode(value, fallback = DEFAULT_DISPLAY_MODE) {
    if (typeof value === "string") {
      const normalizedValue = value.trim();
      if (normalizedValue === "fullscreenPlus") {
        return "comingSoon";
      }
      if (SUPPORTED_DISPLAY_MODES.includes(normalizedValue)) {
        return normalizedValue;
      }
    }

    return SUPPORTED_DISPLAY_MODES.includes(fallback) ? fallback : DEFAULT_DISPLAY_MODE;
  }

  function normalizeSettings(rawSettings) {
    const source = rawSettings || {};
    const next = { ...DEFAULT_SETTINGS };
    for (const key of SETTING_KEYS) {
      if (hasOwn(source, key)) {
        next[key] = source[key];
      }
    }

    next.fontSize = normalizeNumber(next.fontSize, DEFAULT_SETTINGS.fontSize, ...CONTENT_RANGES.fontSize);
    next.speed = normalizeNumber(next.speed, DEFAULT_SETTINGS.speed, ...CONTENT_RANGES.speed);
    next.opacity = normalizeNumber(next.opacity, DEFAULT_SETTINGS.opacity, ...CONTENT_RANGES.opacity);
    next.maxRows = normalizeNumber(next.maxRows, DEFAULT_SETTINGS.maxRows, ...CONTENT_RANGES.maxRows);
    next.verticalStart = normalizeNumber(next.verticalStart, DEFAULT_SETTINGS.verticalStart, ...CONTENT_RANGES.verticalStart);
    next.verticalEnd = normalizeNumber(next.verticalEnd, DEFAULT_SETTINGS.verticalEnd, ...CONTENT_RANGES.verticalEnd);
    next.language = normalizeLanguage(next.language, DEFAULT_SETTINGS.language);
    next.displayMode = normalizeDisplayMode(
      hasOwn(source, "displayMode") ? next.displayMode : undefined,
      normalizeBoolean(source.fullscreenPlus, false) ? "comingSoon" : DEFAULT_SETTINGS.displayMode
    );

    if (next.verticalStart >= next.verticalEnd) {
      next.verticalEnd = clamp(next.verticalStart + 10, ...CONTENT_RANGES.verticalEnd);
      if (next.verticalStart >= next.verticalEnd) {
        next.verticalStart = Math.max(CONTENT_RANGES.verticalStart[0], next.verticalEnd - 10);
      }
    }

    next.showUsernames = normalizeBoolean(next.showUsernames, DEFAULT_SETTINGS.showUsernames);
    next.showBadges = normalizeBoolean(next.showBadges, DEFAULT_SETTINGS.showBadges);
    next.showEmotes = normalizeBoolean(next.showEmotes, DEFAULT_SETTINGS.showEmotes);
    next.showUrls = normalizeBoolean(next.showUrls, DEFAULT_SETTINGS.showUrls);
    next.hideSubscriptions = normalizeBoolean(next.hideSubscriptions, DEFAULT_SETTINGS.hideSubscriptions);
    next.hideCheers = normalizeBoolean(next.hideCheers, DEFAULT_SETTINGS.hideCheers);
    next.enabled = normalizeBoolean(next.enabled, DEFAULT_SETTINGS.enabled);
    return next;
  }

  function getLocalizedStrings(language, scope) {
    const normalizedLanguage = normalizeLanguage(language);
    const pack = I18N[normalizedLanguage] || I18N[DEFAULT_LANGUAGE];
    return {
      ...pack.common,
      ...(pack[scope] || {})
    };
  }

  function applyLocalizedContent(root, strings) {
    const scope = root || (typeof document !== "undefined" ? document : null);
    if (!scope?.querySelectorAll) {
      return;
    }

    for (const element of scope.querySelectorAll("[data-i18n-text]")) {
      const key = element.dataset.i18nText;
      if (key && Object.prototype.hasOwnProperty.call(strings, key)) {
        element.textContent = strings[key];
      }
    }

    for (const element of scope.querySelectorAll("[data-i18n-aria]")) {
      const key = element.dataset.i18nAria;
      if (key && Object.prototype.hasOwnProperty.call(strings, key)) {
        element.setAttribute("aria-label", strings[key]);
      }
    }

    for (const element of scope.querySelectorAll("[data-i18n-title]")) {
      const key = element.dataset.i18nTitle;
      if (key && Object.prototype.hasOwnProperty.call(strings, key)) {
        element.setAttribute("title", strings[key]);
      }
    }
  }

  const exported = {
    DEFAULT_SETTINGS,
    DEFAULT_LANGUAGE,
    DEFAULT_DISPLAY_MODE,
    SUPPORTED_LANGUAGES,
    SUPPORTED_DISPLAY_MODES,
    I18N,
    POPUP_RANGES,
    SETTING_KEYS,
    clamp,
    hasOwn,
    getLocalizedStrings,
    normalizeLanguage,
    normalizeDisplayMode,
    normalizeSettings,
    applyLocalizedContent
  };

  if (typeof globalThis !== "undefined") {
    globalThis.TCO_SETTINGS = exported;
  }

  if (typeof module !== "undefined") {
    module.exports = exported;
  }
})();

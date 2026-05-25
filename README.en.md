# Twitch Comment Overlay

[日本語 README](README.md)

Twitch Comment Overlay is a Chrome extension that displays Twitch chat messages as right-to-left overlay comments on the watch page.

## Features

- Displays Twitch chat messages as comments that move from right to left
- Enables or disables the comment overlay
- Supports Japanese, English, and Korean for the popup and options page
- Adjusts font size, scroll speed, opacity, and row count
- Adjusts the top and bottom edges of the comment display area
- Toggles sender name display before comments
- Sends a test message from the popup
- Shows chat monitoring status and detected message count in the popup

## Installation

1. Open `chrome://extensions/` in Chrome
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select this repository folder
5. Reopen the Twitch watch page

Reload the extension from `chrome://extensions/` after changing permissions or scripts.

## Usage

1. Open a Twitch watch page under `https://www.twitch.tv/`
2. Wait for a new chat message
3. When a message is detected, it is shown from right to left on the page
4. Open the extension popup to change display settings

## Popup Settings

| Setting | Description |
| --- | --- |
| Enable overlay | Enables or disables the overlay |
| Language | Display language for the popup and options page. Japanese, English, and Korean are supported |
| Font size | Comment text size |
| Scroll speed | Number of seconds a comment stays on screen. Higher values move more slowly |
| Opacity | Overall overlay opacity |
| Rows | Number of comment rows |
| Top position | Top edge of the comment display area |
| Bottom position | Bottom edge of the comment display area |
| Show usernames | Shows the sender name before each comment |
| Test overlay | Displays `Overlay test message` in the current Twitch tab |
| Status | Chat monitoring status, detected count, and latest message summary |

Settings are stored in `chrome.storage.local` and remain in the same browser.

## Options Page

Open "Extension options" from the Chrome extension details page to change the same settings in a full tab.

Click "Reset to defaults" to restore the initial settings.

## Display Check

1. Make a Twitch watch page the active tab
2. Open the extension popup
3. Click "Test overlay"
4. Confirm that `Overlay test message` moves in from the right edge of the screen
5. Confirm that the popup status area updates

If the display test fails, open the popup while a Twitch watch page is active.

## Development

Install dependencies:

```bash
npm install
```

Check syntax:

```bash
node --check settings.js && node --check content.js && node --check popup.js && node --check options.js
```

If test files are added, run them with:

```bash
npm test
```

Watch mode:

```bash
npm run test:watch
```

## File Overview

| File | Purpose |
| --- | --- |
| `manifest.json` | Chrome extension manifest |
| `content.js` | Detects Twitch chat messages and renders the overlay |
| `overlay.css` | Styles comments shown on the page |
| `settings.js` | Default settings, setting normalization, ranges, and UI translations |
| `popup.html` / `popup.js` / `popup.css` | Extension popup |
| `options.html` / `options.js` / `options.css` | Options page |

## Notes

If Twitch changes its page structure, chat selector updates may be required.

This extension uses Twitch chat text and usernames for overlay display. Diagnostics store monitoring status, detected counts, and a short preview of the latest comment.

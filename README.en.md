# Twitch Comment Overlay

[Japanese README](README.md)

Twitch Comment Overlay is a Chrome extension that displays Twitch chat messages as right-to-left overlay comments on the watch page.

## Features

- Displays Twitch chat messages as comments that move from right to left
- Enables or disables the comment overlay
- Supports English and Japanese for the popup and options page
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

## Usage

1. Open a Twitch watch page under `https://www.twitch.tv/`
2. Wait for a new chat message
3. When a message is detected, it is shown from right to left on the page
4. Open the extension popup to change display settings

## Popup Settings

| Setting | Description |
| --- | --- |
| Enable overlay | Enables or disables the overlay |
| Language | Display language for the popup and options page. English and Japanese are supported |
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

Use the language setting to switch the popup and options page between English and Japanese.

Click "Reset to defaults" to restore the initial settings.

## Notes

If Twitch changes its page structure, chat selector updates may be required.

This extension uses Twitch chat text and usernames for overlay display. Diagnostics store monitoring status, detected counts, and a short preview of the latest comment.

## Roadmap

### Small features

- Comment speed easing
- Settings presets

### Larger features

- Expand the current display mode into a NicoNico-style chat feature
- Add an overlay display mode that can show Twitch chat as semi-transparent
 chat feature
- Add an overlay display mode that can show Twitch chat as semi-transparent

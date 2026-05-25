# Security Policy

## Supported Versions

This repository currently supports the latest `main` branch only.

## Reporting a Vulnerability

Do not open a public issue for suspected vulnerabilities.

Report security issues privately through GitHub Security Advisories if available on the repository, or contact the maintainer directly through the repository owner profile. Include the affected file, reproduction steps, impact, and any suggested fix.

## Public Repository Hygiene

Before publishing or packaging, verify that the repository does not include private keys, extension signing keys, local `.env` files, or generated extension artifacts.

The project intentionally ignores these local-only files:

- `*.pem`, `*.key`, `.env*`
- `dist-package/`
- `*.crx`, `*.zip`
- `reviews/`
- Chrome Web Store promotional assets outside `assets/icons/`

## Security Checks

Run these checks before opening or merging a pull request:

```bash
npm run check
npm run security:audit
npm test
```

The GitHub workflows run dependency audit, DOM extraction tests, and CodeQL analysis on pull requests and supported branches.

The extension should continue to avoid remote code execution and should render untrusted Twitch chat text only through text APIs such as `textContent` or `createTextNode`. Diagnostics must not persist extracted chat text, usernames, or emote text.
ed chat text, usernames, or emote text.

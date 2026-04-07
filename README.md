GeForce NOW Metacritic Score is a Manifest V3 Chromium extension that displays Metacritic scores on the GeForce NOW games page for signed-in users.

<img width="1918" height="848" alt="image" src="https://github.com/user-attachments/assets/d6f38cf3-8fef-4441-8288-7e5bd7346115" />

## What it does

When you open `https://play.geforcenow.com/mall/#/layout/games`, the extension:

- scans visible `gfn-game-tile` cards
- looks up each game on Metacritic
- adds a small score badge on titles that have a score available
- caches results locally to avoid repeated lookups
- reads the dedicated Metacritic score chip from search results to avoid date-number mismatches

## Install

1. Open your Chromium-based browser extensions page.
2. Enable developer mode.
3. Choose `Load unpacked`.
4. Select this repository folder.

## Package

1. Bump the `version` in `manifest.json`.
2. Ensure `assets/` contains the generated extension icons and any store listing assets.
3. Create a zip that contains `manifest.json`, `src/`, `assets/`, `README.md`, and `PRIVACY.md` at the zip root.
4. Upload that zip to the Chrome Web Store or Edge Add-ons portal.

## Test

Run:

```powershell
node --test
```

## Notes

- The extension is currently focused on the GeForce NOW games layout page.
- Scores are resolved from Metacritic search results and only displayed when a reliable match is found.
- The extension stores only a local cache of resolved scores in `chrome.storage.local`.

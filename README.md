# Shorts Autoplay — Auto-advance to the next Short

YouTube Shorts loop forever by default. This Chrome extension moves on to the next Short when the
current one is done, so you can lean back and let the feed play.

## What it does

- **Advance when** the video ends (default), after *N* loops, or after *N* seconds of watching.
- Optional delay before moving on (0 / 0.5 / 1 / 2 s).
- Pauses advancing while the tab is hidden, unless you say otherwise.
- A small button inside the Shorts player shows the state and a progress ring; click it to toggle.
- Keyboard shortcut `Alt+Shift+A` toggles autoplay anywhere.
- Settings sync across your Chrome profiles (`chrome.storage.sync`).

No accounts, no analytics, no network requests. Permissions: `storage` and `https://www.youtube.com/*`.

## Install (developer mode)

1. Clone this repository.
2. Open `chrome://extensions`, turn on **Developer mode**.
3. **Load unpacked** → select the repository folder.
4. Open any Short. The ▸▸ button appears under the like/comment column.

## How it works

Shorts play with the `<video loop>` attribute, so a Short never fires `ended`. The content script
watches the active `ytd-reel-video-renderer`, turns `loop` off while the "video ends" rule is in
force (and detects the wrap back to 0 as a fallback), then advances the way a user would: it clicks
the player's own *next* button, or sends `ArrowDown`. YouTube's player state is otherwise untouched.

```
manifest.json   MV3 manifest
content.js      detection + advancing + inline button      content.css
popup.html/js   settings UI                                popup.css
background.js   toolbar badge and the keyboard shortcut
icons/          extension icons
```

## Development

Plain JavaScript, no build step. After editing, click **Reload** on the extension card.

## License

MIT

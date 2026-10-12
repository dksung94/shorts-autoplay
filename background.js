// Service worker: keeps the toolbar icon in sync with the setting, and handles the shortcut.
// Everything that matters happens in content.js; this file only reflects and relays state.

const DEFAULTS = { enabled: true };

function paintBadge(enabled) {
  chrome.action.setBadgeText({ text: enabled ? "" : "OFF" });
  chrome.action.setBadgeBackgroundColor({ color: "#555" });
  chrome.action.setTitle({ title: enabled ? "Shorts Autoplay: on" : "Shorts Autoplay: off" });
}

function refresh() {
  chrome.storage.sync.get(DEFAULTS, (s) => paintBadge(s.enabled !== false));
}

chrome.runtime.onInstalled.addListener(refresh);
chrome.runtime.onStartup.addListener(refresh);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.enabled) paintBadge(changes.enabled.newValue !== false);
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== "toggle-autoplay") return;
  chrome.storage.sync.get(DEFAULTS, (s) => {
    const enabled = !(s.enabled !== false);
    chrome.storage.sync.set({ enabled });
    chrome.tabs.query({ url: "https://www.youtube.com/shorts/*" }, (tabs) => {
      for (const t of tabs) chrome.tabs.sendMessage(t.id, { type: "sap-pulse" }).catch(() => {});
    });
  });
});

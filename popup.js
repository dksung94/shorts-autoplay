// Popup: reads and writes the shared settings. The content script picks changes up live.
const DEFAULTS = { enabled: true, mode: "ended", loops: 2, seconds: 30, delayMs: 500, skipHidden: false, toast: true, inlineButton: true };
const $ = (id) => document.getElementById(id);

function render(s) {
  $("enabled").checked = s.enabled;
  $("settings").classList.toggle("off", !s.enabled);
  document.querySelectorAll('input[name="mode"]').forEach((r) => { r.checked = r.value === s.mode; });
  $("loops").value = s.loops;
  $("seconds").value = s.seconds;
  $("delayMs").value = String(s.delayMs);
  $("skipHidden").checked = s.skipHidden;
  $("toast").checked = s.toast;
  $("inlineButton").checked = s.inlineButton;
}

function clampInt(v, lo, hi, dflt) { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; }

function save() {
  const mode = document.querySelector('input[name="mode"]:checked');
  chrome.storage.sync.set({
    enabled: $("enabled").checked,
    mode: mode ? mode.value : "ended",
    loops: clampInt($("loops").value, 1, 20, 2),
    seconds: clampInt($("seconds").value, 5, 600, 30),
    delayMs: clampInt($("delayMs").value, 0, 5000, 500),
    skipHidden: $("skipHidden").checked,
    toast: $("toast").checked,
    inlineButton: $("inlineButton").checked,
  });
}

chrome.storage.sync.get(DEFAULTS, (s) => render({ ...DEFAULTS, ...s }));
chrome.storage.onChanged.addListener((changes, area) => {   // e.g. the shortcut toggled it meanwhile
  if (area === "sync") chrome.storage.sync.get(DEFAULTS, (s) => render({ ...DEFAULTS, ...s }));
});
document.body.addEventListener("change", save);
// Clicking the number box should also select its radio.
["loops", "seconds"].forEach((id) => $(id).addEventListener("focus", () => {
  document.querySelector(`input[name="mode"][value="${id}"]`).checked = true; save();
}));
$("shortcuts").addEventListener("click", (e) => { e.preventDefault(); chrome.tabs.create({ url: "chrome://extensions/shortcuts" }); });
chrome.commands.getAll((cmds) => {
  const c = cmds.find((x) => x.name === "toggle-autoplay");
  if (c && c.shortcut) $("shortcut").textContent = c.shortcut;
  else if (c) $("shortcut").textContent = "not set";
});

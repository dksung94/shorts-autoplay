// Shorts Autoplay — content script.
//
// YouTube Shorts play with the <video loop> attribute, so a Short never "ends": it wraps back
// to 0. This script watches the active Short, decides when it is done (first end, N loops, or a
// time budget), and advances the feed the way a user would (the "next" button, or ArrowDown).
// Nothing here touches YouTube's player state except `video.loop`, which is turned off only
// while the "video ends" mode needs a real `ended` event.

(() => {
  "use strict";

  const DEFAULTS = {
    enabled: true,
    mode: "ended",        // "ended" | "loops" | "seconds"
    loops: 2,
    seconds: 30,
    delayMs: 500,
    skipHidden: false,    // advance even when the tab is in the background
    toast: true,
    inlineButton: true,
  };

  let settings = { ...DEFAULTS };
  let video = null;             // the active Short's <video>
  let renderer = null;          // its ytd-reel-video-renderer
  let lastTime = 0;             // last currentTime seen, for wrap detection
  let loopsDone = 0;            // completed plays of the current Short
  let watched = 0;              // seconds of playback on the current Short
  let advanceTimer = null;
  let pendingAdvance = false;   // decided to advance but waiting (delay / hidden tab)
  let armed = false;            // true once the current Short has started playing
  let shortId = "";             // /shorts/<id> we are counting for
  let lastAdvance = { id: "", at: 0 };   // guard against advancing twice for one Short
  let ui = null;                // inline button elements

  // ---------------------------------------------------------------- settings
  chrome.storage.sync.get(DEFAULTS, (s) => { settings = { ...DEFAULTS, ...s }; applySettings(); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const k of Object.keys(changes)) settings[k] = changes[k].newValue;
    applySettings();
  });

  function applySettings() {
    if (video) video.loop = !(settings.enabled && settings.mode === "ended");
    if (!settings.enabled) cancelAdvance();
    renderUi();
  }

  // ---------------------------------------------------------------- page tracking
  const isShortsPage = () => location.pathname.startsWith("/shorts/");

  function findActive() {
    const r = document.querySelector("ytd-reel-video-renderer[is-active]");
    const v = r ? r.querySelector("video") : document.querySelector("#shorts-player video");
    return { r: r || null, v: v || null };
  }

  function attach() {
    if (!isShortsPage()) { detach(); return; }
    const { r, v } = findActive();
    if (v === video && r === renderer) return;
    detach();
    video = v; renderer = r;
    if (!video) return;
    resetCounters();
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("ended", onEnded);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("loadstart", resetCounters);   // Shorts reuse one <video>: a new src is a new Short
    video.addEventListener("emptied", resetCounters);
    applySettings();
    mountUi();
  }

  function detach() {
    cancelAdvance();
    if (video) {
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("loadstart", resetCounters);
      video.removeEventListener("emptied", resetCounters);
      video.loop = true;                       // give YouTube its default back
    }
    video = null; renderer = null;
    unmountUi();
  }

  // YouTube is a single-page app: navigation and feed scrolling swap the active renderer.
  document.addEventListener("yt-navigate-finish", () => setTimeout(attach, 50));
  const observer = new MutationObserver(() => { if (isShortsPage()) attach(); });
  observer.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ["is-active"] });
  setInterval(attach, 1500);                   // belt and braces for layout changes
  attach();

  // ---------------------------------------------------------------- completion rules
  function resetCounters() {
    cancelAdvance();
    lastTime = 0; loopsDone = 0; watched = 0; armed = false;
    shortId = location.pathname;
    updateRing(0, 1);
  }

  function onPlaying() { /* arming happens in onTime once playback has really progressed */ }

  function onTime() {
    if (!video || !settings.enabled) return;
    if (location.pathname !== shortId) { resetCounters(); return; }          // moved to another Short
    const t = video.currentTime, d = video.duration || 0;
    if (!armed) { if (t > 0.3) { armed = true; lastTime = t; } else { lastTime = t; } return; }
    const justAdvanced = lastAdvance.id === shortId && Date.now() - lastAdvance.at < 4000;
    if (!justAdvanced && t + 0.05 < lastTime && lastTime > Math.max(0, d - 1.5)) {   // wrapped to the start
      loopsDone += 1;
      if (settings.mode === "loops" && loopsDone >= settings.loops) requestAdvance();
      if (settings.mode === "ended") requestAdvance();                      // loop attr was re-set by YT
    }
    if (t > lastTime) watched += Math.min(t - lastTime, 1);
    lastTime = t;
    if (settings.mode === "seconds" && watched >= settings.seconds) requestAdvance();
    updateRing(t, d);
  }

  function onEnded() {
    if (!settings.enabled || !armed) return;
    if (lastAdvance.id === shortId && Date.now() - lastAdvance.at < 4000) return;
    loopsDone += 1;
    if (settings.mode === "ended" || (settings.mode === "loops" && loopsDone >= settings.loops)) requestAdvance();
    else if (settings.mode === "loops" || settings.mode === "seconds") { video.currentTime = 0; video.play().catch(() => {}); }
  }

  // ---------------------------------------------------------------- advancing
  function requestAdvance() {
    if (pendingAdvance || !video) return;
    if (lastAdvance.id === shortId && Date.now() - lastAdvance.at < 4000) return;   // already did this Short
    pendingAdvance = true;
    if (document.hidden && !settings.skipHidden) {
      document.addEventListener("visibilitychange", onVisible);
      return;
    }
    advanceTimer = setTimeout(advance, settings.delayMs);
  }

  function onVisible() {
    if (document.hidden) return;
    document.removeEventListener("visibilitychange", onVisible);
    if (pendingAdvance) advanceTimer = setTimeout(advance, settings.delayMs);
  }

  function cancelAdvance() {
    pendingAdvance = false;
    clearTimeout(advanceTimer); advanceTimer = null;
    document.removeEventListener("visibilitychange", onVisible);
  }

  function advance() {
    advanceTimer = null;
    if (!settings.enabled || !isShortsPage()) { pendingAdvance = false; return; }
    lastAdvance = { id: shortId, at: Date.now() };
    armed = false;                                           // the next Short must prove itself first
    const btn = document.querySelector("#navigation-button-down button, [aria-label='Next video'], [aria-label='다음 동영상']");
    if (btn) btn.click();
    else document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", keyCode: 40, bubbles: true }));
    if (settings.toast) showToast("Next ▸");
    pendingAdvance = false;
    setTimeout(attach, 300);
  }

  // ---------------------------------------------------------------- inline UI
  function mountUi() {
    if (!settings.inlineButton || !renderer) return;
    const actions = renderer.querySelector("#actions");
    if (!actions) return;
    const existing = actions.querySelector(".sap-btn");
    if (existing) { ui = { btn: existing }; renderUi(); return; }
    const btn = document.createElement("button");
    btn.className = "sap-btn";
    btn.type = "button";
    btn.innerHTML =
      '<svg viewBox="0 0 36 36" class="sap-ring"><circle class="sap-track" cx="18" cy="18" r="15.5"/>' +
      '<circle class="sap-prog" cx="18" cy="18" r="15.5"/></svg>' +
      '<span class="sap-glyph">▸▸</span>';
    btn.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      chrome.storage.sync.set({ enabled: !settings.enabled });
    });
    actions.appendChild(btn);
    ui = { btn };
    renderUi();
  }

  function unmountUi() { ui = null; }

  function renderUi() {
    if (!ui || !ui.btn) return;
    ui.btn.classList.toggle("sap-on", !!settings.enabled);
    ui.btn.title = settings.enabled ? "Shorts Autoplay: on — click to turn off" : "Shorts Autoplay: off — click to turn on";
    ui.btn.style.display = settings.inlineButton ? "" : "none";
  }

  function updateRing(t, d) {
    if (!ui || !ui.btn || !settings.enabled) return;
    let frac = 0;
    if (settings.mode === "ended") frac = d ? t / d : 0;
    else if (settings.mode === "loops") frac = d ? (loopsDone + t / d) / settings.loops : 0;
    else frac = watched / settings.seconds;
    const prog = ui.btn.querySelector(".sap-prog");
    if (prog) prog.style.strokeDashoffset = String(97.4 * (1 - Math.min(1, Math.max(0, frac))));
  }

  let toastEl = null, toastTimer = null;
  function showToast(text) {
    if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "sap-toast"; document.body.appendChild(toastEl); }
    toastEl.textContent = text;
    toastEl.classList.add("sap-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("sap-show"), 700);
  }

  // Pulse the inline button when the shortcut toggles us (background relays the command).
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "sap-pulse" && ui && ui.btn) {
      ui.btn.classList.remove("sap-pulse"); void ui.btn.offsetWidth; ui.btn.classList.add("sap-pulse");
    }
  });
})();

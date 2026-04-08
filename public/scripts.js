function setLeadStatus(el, text, kind) {
  if (!el) return;
  el.textContent = text || "";
  el.classList.remove(
    "status-message--success",
    "status-message--error",
    "status-message--loading",
    "status-message--info",
    "status-message--neutral"
  );
  if (kind) el.classList.add("status-message--" + kind);
}

async function submitLeadForm(e) {
  e.preventDefault();
  const form = e.target;
  const statusEl = document.getElementById("lead_status");
  const submitBtn = form.querySelector("button[type=submit]");

  if (submitBtn) submitBtn.disabled = true;
  setLeadStatus(statusEl, "Sending request…", "loading");

  const payload = Object.fromEntries(new FormData(form).entries());

  try {
    const resp = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error || `Request failed (${resp.status})`);
    }

    setLeadStatus(statusEl, "Thanks—we’ve received your request. We’ll contact you shortly.", "success");
    form.reset();
  } catch (err) {
    setLeadStatus(statusEl, err.message || "Something went wrong. Please try again.", "error");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

/** Region sheet controls shared by the globe button and global-tenant search gate (M3 modal shell). */
function getRegionSheetControls() {
  const openBtn = document.getElementById("wf-region-open");
  const root = document.getElementById("wf-region-m3-root");
  const overlay = document.getElementById("wf-region-overlay");
  const sheet = document.getElementById("wf-region-sheet");
  const closeBtn = document.getElementById("wf-region-close-x");
  if (!root || !sheet) return null;

  const setOpen = (open) => {
    if (openBtn) openBtn.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      root.removeAttribute("hidden");
      root.setAttribute("aria-hidden", "false");
      void root.offsetWidth;
      root.classList.add("m3-modal-overlay--open");
      document.body.style.overflow = "hidden";
      closeBtn?.focus();
    } else {
      root.classList.remove("m3-modal-overlay--open");
      const finish = () => {
        root.setAttribute("hidden", "");
        root.setAttribute("aria-hidden", "true");
        document.body.style.overflow = "";
        openBtn?.focus();
      };
      let done = false;
      const onEnd = (e) => {
        if (e.target !== root || e.propertyName !== "opacity") return;
        if (done) return;
        done = true;
        root.removeEventListener("transitionend", onEnd);
        finish();
      };
      root.addEventListener("transitionend", onEnd);
      window.setTimeout(() => {
        if (done) return;
        done = true;
        root.removeEventListener("transitionend", onEnd);
        finish();
      }, 320);
    }
  };

  return { openBtn, overlay, sheet, closeBtn, setOpen, root };
}

function initRegionPicker() {
  const c = getRegionSheetControls();
  if (!c) return;

  const { openBtn, overlay, sheet, closeBtn, setOpen, root } = c;

  openBtn?.addEventListener("click", () => setOpen(true));
  closeBtn?.addEventListener("click", () => setOpen(false));
  overlay?.addEventListener("click", () => setOpen(false));
  sheet.querySelectorAll("a.wf-region-btn").forEach((a) => {
    a.addEventListener("click", () => setOpen(false));
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && root && !root.hasAttribute("hidden")) setOpen(false);
  });
}

/** On global tenant home, search UI is not regional — open the region picker instead. */
function initGlobalTenantSearchOpensRegion() {
  if (!document.getElementById("wf-region-open")) return;
  const c = getRegionSheetControls();
  if (!c) return;
  const { setOpen } = c;
  if (!document.body.classList.contains("tenant-global")) return;

  const q = document.getElementById("home-search-q");
  const city = document.getElementById("home-search-city");
  const form = document.querySelector("form.gp-search-bar");

  const openSheet = () => setOpen(true);

  [q, city].forEach((el) => {
    if (!el) return;
    el.addEventListener("focus", openSheet);
    el.addEventListener("click", openSheet);
  });
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    setOpen(true);
  });
}

function initDirectoryAvatarHue() {
  document.querySelectorAll("[data-avatar-hue]").forEach((el) => {
    const h = el.getAttribute("data-avatar-hue");
    if (h != null && h !== "") el.style.setProperty("--avatar-hue", h);
  });
}

function scheduleAfterInteractivity(fn) {
  if (window.requestIdleCallback) {
    window.requestIdleCallback(fn, { timeout: 2500 });
    return;
  }
  window.setTimeout(fn, 350);
}

function applyAvatarHueOnce(el) {
  if (!el || el.nodeType !== 1) return;
  if (el.dataset && el.dataset.avatarHueApplied === "1") return;
  const h = el.getAttribute("data-avatar-hue");
  if (h != null && h !== "") el.style.setProperty("--avatar-hue", h);
  if (el.dataset) el.dataset.avatarHueApplied = "1";
}

function collectAvatarHueEls() {
  return Array.from(document.querySelectorAll("[data-avatar-hue]"));
}

function getLikelyVisibleAvatarEls(els) {
  const vh = window.innerHeight || 0;
  // Small margin so near-the-fold cards are also “immediate”.
  const margin = 220;
  const visible = [];
  for (let i = 0; i < els.length; i++) {
    const el = els[i];
    if (el.dataset && el.dataset.avatarHueApplied === "1") continue;
    const r = el.getBoundingClientRect();
    if (r.bottom < -margin) continue;
    if (r.top > vh + margin) continue;
    visible.push(el);
  }
  // Cap work to avoid startup long tasks on huge lists.
  visible.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  return visible.slice(0, 16);
}

function applyAvatarHuesIdleChunked(els) {
  const remaining = els.filter((el) => !(el.dataset && el.dataset.avatarHueApplied === "1"));
  if (remaining.length === 0) return;

  const run = (deadline) => {
    let budget = deadline && typeof deadline.timeRemaining === "function" ? deadline.timeRemaining() : 8;
    // Process small batches; bail when time is low.
    while (remaining.length && budget > 4) {
      const el = remaining.shift();
      applyAvatarHueOnce(el);
      budget = deadline && typeof deadline.timeRemaining === "function" ? deadline.timeRemaining() : 0;
    }
    if (remaining.length) {
      if (window.requestIdleCallback) window.requestIdleCallback(run, { timeout: 2500 });
      else window.setTimeout(() => run(null), 40);
    }
  };

  if (window.requestIdleCallback) window.requestIdleCallback(run, { timeout: 2500 });
  else window.setTimeout(() => run(null), 200);
}

// Mobile perf: apply avatar hues immediately for visible cards; defer the rest to idle (chunked).
function initDirectoryAvatarHueDeferredOnMobile() {
  if (!isMobileLikeViewport()) {
    initDirectoryAvatarHue();
    return;
  }
  const els = collectAvatarHueEls();
  if (els.length === 0) return;

  // Immediate: above-the-fold/first visible avatars (reduces “unstyled” risk).
  getLikelyVisibleAvatarEls(els).forEach(applyAvatarHueOnce);

  // Deferred: everything else, chunked in idle time (reduces TBT).
  scheduleAfterInteractivity(() => applyAvatarHuesIdleChunked(els));
}

// Mobile perf: defer region picker wiring until user opens it.
function initRegionPickerLazyOnMobile() {
  if (!isMobileLikeViewport()) {
    initRegionPicker();
    return;
  }
  const openBtn = document.getElementById("wf-region-open");
  if (!openBtn) return;

  // Prevent duplicate wiring across multiple entry points.
  const ensureInit = () => {
    if (window.__getproRegionPickerInit) return false;
    window.__getproRegionPickerInit = true;
    initRegionPicker();
    return true;
  };

  // Earliest intent: initialize before the click is dispatched so the *same* interaction opens reliably.
  // - pointerdown/touchstart: happens before click → no replay needed.
  // - focusin: accessibility; ensures keyboard activation works on first try.
  const onPointerDown = () => {
    if (ensureInit()) cleanup();
  };
  const onTouchStart = () => {
    if (ensureInit()) cleanup();
  };
  const onFocusIn = (e) => {
    if (e.target !== openBtn) return;
    if (ensureInit()) cleanup();
  };

  // Fallback: if the first intent is a click (e.g. some assistive tech / synthetic click),
  // listeners added during this event won't fire for the same click → replay once.
  const onClickCapture = (e) => {
    if (window.__getproRegionPickerInit) return;
    e.preventDefault();
    e.stopPropagation();
    ensureInit();
    cleanup();
    // Replay on next tick so initRegionPicker's click handler can run.
    window.setTimeout(() => openBtn.click(), 0);
  };

  function cleanup() {
    openBtn.removeEventListener("pointerdown", onPointerDown, true);
    openBtn.removeEventListener("touchstart", onTouchStart, true);
    openBtn.removeEventListener("focusin", onFocusIn, true);
    openBtn.removeEventListener("click", onClickCapture, true);
  }

  openBtn.addEventListener("pointerdown", onPointerDown, true);
  openBtn.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
  openBtn.addEventListener("focusin", onFocusIn, true);
  openBtn.addEventListener("click", onClickCapture, true);
}

/** Tenant join flow in an iframe (header “Join Us”, nav “List your business”, home CTA). */
function initJoinUsModal() {
  const modal = document.getElementById("wf-join-us-modal");
  const iframe = document.getElementById("wf-join-us-iframe");
  if (!modal || !iframe) return;

  const joinSrc = modal.getAttribute("data-join-src") || "/join";
  const triggers = document.querySelectorAll("[data-wf-join-us-open]");

  let lastFocus = null;

  function finishClose() {
    iframe.src = "about:blank";
    modal.setAttribute("hidden", "");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (lastFocus && typeof lastFocus.focus === "function") {
      lastFocus.focus();
    }
    lastFocus = null;
  }

  function closeModal() {
    modal.classList.remove("m3-modal-overlay--open");
    let done = false;
    function onEnd(e) {
      if (e.target !== modal || e.propertyName !== "opacity") return;
      if (done) return;
      done = true;
      modal.removeEventListener("transitionend", onEnd);
      finishClose();
    }
    modal.addEventListener("transitionend", onEnd);
    window.setTimeout(() => {
      if (done) return;
      done = true;
      modal.removeEventListener("transitionend", onEnd);
      finishClose();
    }, 320);
  }

  function openModal() {
    lastFocus = document.activeElement;
    modal.removeAttribute("hidden");
    modal.setAttribute("aria-hidden", "false");
    void modal.offsetWidth;
    modal.classList.add("m3-modal-overlay--open");
    iframe.src = joinSrc;
    document.body.style.overflow = "hidden";
    const closeBtn = modal.querySelector("[data-wf-join-us-dismiss].m3-modal__close");
    if (closeBtn) closeBtn.focus();
  }

  triggers.forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      openModal();
    });
  });

  modal.addEventListener("click", (e) => {
    if (e.target.closest(".m3-modal-overlay__backdrop") || e.target.closest("[data-wf-join-us-dismiss]")) {
      closeModal();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hasAttribute("hidden")) closeModal();
  });
}

function initRefineSearchFab() {
  document.querySelectorAll(".pro-refine-search-fab[data-refine-target]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sel = btn.getAttribute("data-refine-target");
      if (!sel) return;
      const el = document.querySelector(sel);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      const focusable = el.querySelector(".pro-ac-input");
      if (focusable) window.setTimeout(() => focusable.focus(), 450);
    });
  });
}

function initAppNavDrawer() {
  const toggle = document.getElementById("wf-app-nav-toggle");
  const drawer = document.getElementById("wf-app-nav-drawer");
  const backdrop = document.getElementById("wf-app-nav-backdrop");
  const closeBtn = document.getElementById("wf-app-nav-close");
  if (!toggle || !drawer || !backdrop || !closeBtn) return;

  const layout = toggle.closest(".app-layout") || document.body;

  const open = () => {
    layout.classList.add("app-nav-drawer-open");
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-label", "Close navigation");
    backdrop.removeAttribute("hidden");
    document.body.style.overflow = "hidden";
    void closeBtn.offsetWidth;
    drawer.setAttribute("aria-hidden", "false");
    closeBtn.focus();
  };

  const close = () => {
    layout.classList.remove("app-nav-drawer-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open navigation");
    backdrop.setAttribute("hidden", "");
    document.body.style.overflow = "";
    drawer.setAttribute("aria-hidden", "true");
    toggle.focus();
  };

  toggle.addEventListener("click", () => {
    if (layout.classList.contains("app-nav-drawer-open")) close();
    else open();
  });
  backdrop.addEventListener("click", close);
  closeBtn.addEventListener("click", close);

  drawer.querySelectorAll("a").forEach((a) => {
    a.addEventListener("click", () => close());
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && layout.classList.contains("app-nav-drawer-open")) close();
  });
}

function isMobileLikeViewport() {
  try {
    return (
      (window.matchMedia && window.matchMedia("(max-width: 720px)").matches) ||
      (window.matchMedia && window.matchMedia("(pointer: coarse)").matches)
    );
  } catch (e) {
    return false;
  }
}

// Mobile perf: defer nav drawer wiring until first tap.
function initAppNavDrawerLazyOnMobile() {
  if (!isMobileLikeViewport()) {
    initAppNavDrawer();
    return;
  }
  const toggle = document.getElementById("wf-app-nav-toggle");
  if (!toggle) return;
  const onFirstTap = (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggle.removeEventListener("click", onFirstTap, true);
    initAppNavDrawer();
    // Replay the user's intent now that handlers exist.
    toggle.click();
  };
  toggle.addEventListener("click", onFirstTap, true);
}

// PERF WARNING: Keep new behavior behind DOM guards — this file loads on every public page; regressions hit LCP/INP (docs/route-ownership-matrix.md).
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("lead_form");
  if (form) form.addEventListener("submit", submitLeadForm);
  if (document.getElementById("wf-region-m3-root")) {
    initRegionPickerLazyOnMobile();
    initGlobalTenantSearchOpensRegion();
  }
  if (document.querySelector("[data-avatar-hue]")) initDirectoryAvatarHueDeferredOnMobile();
  if (document.querySelector(".pro-refine-search-fab[data-refine-target]")) initRefineSearchFab();
  if (document.getElementById("wf-join-us-modal")) initJoinUsModal();
  initAppNavDrawerLazyOnMobile();
});

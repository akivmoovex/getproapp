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
  const c = getRegionSheetControls();
  if (!c) return;
  const { setOpen } = c;
  if (!document.body.classList.contains("tenant-global")) return;

  const q = document.getElementById("home-search-q");
  const city = document.getElementById("home-search-city");
  const form = document.querySelector(".pro-home-dual-search");

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

// PERF WARNING: Keep new behavior behind DOM guards — this file loads on every public page; regressions hit LCP/INP (docs/route-ownership-matrix.md).
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("lead_form");
  if (form) form.addEventListener("submit", submitLeadForm);
  if (document.getElementById("wf-region-m3-root")) {
    initRegionPicker();
    initGlobalTenantSearchOpensRegion();
  }
  if (document.querySelector("[data-avatar-hue]")) initDirectoryAvatarHue();
  if (document.querySelector(".pro-refine-search-fab[data-refine-target]")) initRefineSearchFab();
  initAppNavDrawer();
});

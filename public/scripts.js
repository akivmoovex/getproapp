async function submitLeadForm(e) {
  e.preventDefault();
  const form = e.target;
  const statusEl = document.getElementById("lead_status");
  const submitBtn = form.querySelector("button[type=submit]");

  if (submitBtn) submitBtn.disabled = true;
  if (statusEl) statusEl.textContent = "Sending...";

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

    if (statusEl) statusEl.textContent = "Thanks! Our team will contact you shortly.";
    form.reset();
  } catch (err) {
    if (statusEl) statusEl.textContent = err.message || "Something went wrong.";
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

function initHomeDrawerMenu() {
  const root = document.querySelector(".wf-home-layout");
  const sidebar = document.getElementById("wf-home-sidebar");
  const toggle = document.getElementById("wf-menu-toggle");
  const backdrop = document.getElementById("wf-menu-backdrop");
  if (!root || !sidebar || !toggle || !backdrop) return;

  const open = () => {
    root.classList.add("wf-menu-drawer-open");
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-label", "Close menu");
    backdrop.removeAttribute("hidden");
    document.body.style.overflow = "hidden";
  };

  const close = () => {
    root.classList.remove("wf-menu-drawer-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open menu");
    backdrop.setAttribute("hidden", "");
    document.body.style.overflow = "";
  };

  toggle.addEventListener("click", () => {
    if (root.classList.contains("wf-menu-drawer-open")) close();
    else open();
  });
  backdrop.addEventListener("click", close);

  const sidebarClose = document.getElementById("wf-sidebar-close");
  sidebarClose?.addEventListener("click", close);

  sidebar.querySelectorAll("a").forEach((a) => {
    a.addEventListener("click", () => close());
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && root.classList.contains("wf-menu-drawer-open")) close();
  });
}

/** Region sheet controls shared by the globe button and global-tenant search gate. */
function getRegionSheetControls() {
  const openBtn = document.getElementById("wf-region-open");
  const overlay = document.getElementById("wf-region-overlay");
  const sheet = document.getElementById("wf-region-sheet");
  const closeBtn = document.getElementById("wf-region-close-x");
  if (!overlay || !sheet) return null;

  const setOpen = (open) => {
    if (openBtn) openBtn.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      sheet.removeAttribute("hidden");
      overlay.removeAttribute("hidden");
      overlay.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      closeBtn?.focus();
    } else {
      sheet.setAttribute("hidden", "");
      overlay.setAttribute("hidden", "");
      overlay.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
      openBtn?.focus();
    }
  };

  return { openBtn, overlay, sheet, closeBtn, setOpen };
}

function initRegionPicker() {
  const c = getRegionSheetControls();
  if (!c) return;

  const { openBtn, overlay, sheet, closeBtn, setOpen } = c;

  openBtn?.addEventListener("click", () => setOpen(true));
  closeBtn?.addEventListener("click", () => setOpen(false));
  overlay.addEventListener("click", () => setOpen(false));
  sheet.querySelectorAll("a.wf-region-btn").forEach((a) => {
    a.addEventListener("click", () => setOpen(false));
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !sheet.hasAttribute("hidden")) setOpen(false);
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

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("lead_form");
  if (form) form.addEventListener("submit", submitLeadForm);
  initHomeDrawerMenu();
  initRegionPicker();
  initGlobalTenantSearchOpensRegion();
});

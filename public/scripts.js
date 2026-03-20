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
  const closeBtn = document.getElementById("wf-menu-close");
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
  closeBtn?.addEventListener("click", close);
  backdrop.addEventListener("click", close);

  sidebar.querySelectorAll("a").forEach((a) => {
    a.addEventListener("click", () => close());
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && root.classList.contains("wf-menu-drawer-open")) close();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("lead_form");
  if (form) form.addEventListener("submit", submitLeadForm);
  initHomeDrawerMenu();
});


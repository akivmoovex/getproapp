document.addEventListener("DOMContentLoaded", function () {
  var toggle = document.getElementById("cp-nav-toggle");
  var drawer = document.getElementById("cp-nav-drawer");
  var backdrop = document.getElementById("cp-nav-backdrop");
  var closeBtn = document.getElementById("cp-nav-close");
  if (!toggle || !drawer || !backdrop) return;

  var layout = document.body;

  function openNav() {
    layout.classList.add("company-portal-drawer-open");
    toggle.setAttribute("aria-expanded", "true");
    backdrop.removeAttribute("hidden");
    drawer.setAttribute("aria-hidden", "false");
  }

  function closeNav() {
    layout.classList.remove("company-portal-drawer-open");
    toggle.setAttribute("aria-expanded", "false");
    backdrop.setAttribute("hidden", "");
    drawer.setAttribute("aria-hidden", "true");
    toggle.focus();
  }

  toggle.addEventListener("click", function () {
    if (layout.classList.contains("company-portal-drawer-open")) closeNav();
    else openNav();
  });
  backdrop.addEventListener("click", closeNav);
  if (closeBtn) closeBtn.addEventListener("click", closeNav);
  drawer.querySelectorAll("a").forEach(function (a) {
    a.addEventListener("click", closeNav);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && layout.classList.contains("company-portal-drawer-open")) closeNav();
  });
});

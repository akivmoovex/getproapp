/**
 * Member portal shell helpers — drawer toggle only (no network).
 */
(function () {
  "use strict";

  function initDrawer() {
    var toggle = document.querySelector('[data-bb-nav="mobile-toggle"]');
    var drawer = document.getElementById("bb-mp-drawer");
    if (!toggle || !drawer) return;

    function setOpen(open) {
      drawer.hidden = !open;
      drawer.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      document.body.classList.toggle("bb-mp-drawer-open", open);
    }

    toggle.addEventListener("click", function () {
      setOpen(drawer.hidden);
    });

    drawer.querySelectorAll('[data-bb-nav="drawer-close"]').forEach(function (el) {
      el.addEventListener("click", function () {
        setOpen(false);
      });
    });

    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && !drawer.hidden) setOpen(false);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDrawer);
  } else {
    initDrawer();
  }
})();

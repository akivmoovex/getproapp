/**
 * Apex marketing shell — mobile drawer only (CSP-compatible external script).
 */
(function () {
  "use strict";

  function init() {
    var btn = document.getElementById("bb-apex-menu-btn");
    var drawer = document.getElementById("bb-apex-drawer");
    if (!btn || !drawer) return;

    var backdrop = drawer.querySelector("[data-bb-apex-drawer-close]");
    var panelClose = drawer.querySelector(".bb-apex-drawer__close");

    function setOpen(open) {
      if (open) {
        drawer.removeAttribute("hidden");
        btn.setAttribute("aria-expanded", "true");
        document.documentElement.classList.add("bb-apex-drawer-open");
        if (panelClose) {
          try {
            panelClose.focus();
          } catch (_) {
            /* ignore */
          }
        }
      } else {
        drawer.setAttribute("hidden", "");
        btn.setAttribute("aria-expanded", "false");
        document.documentElement.classList.remove("bb-apex-drawer-open");
        try {
          btn.focus();
        } catch (_) {
          /* ignore */
        }
      }
    }

    btn.addEventListener("click", function () {
      setOpen(drawer.hasAttribute("hidden"));
    });

    drawer.querySelectorAll("[data-bb-apex-drawer-close]").forEach(function (el) {
      el.addEventListener("click", function () {
        setOpen(false);
      });
    });

    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && !drawer.hasAttribute("hidden")) {
        setOpen(false);
      }
    });

    if (backdrop) {
      /* already bound via data-bb-apex-drawer-close */
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

/**
 * Apex marketing shell — mobile drawer (CSP-compatible external script).
 */
(function () {
  "use strict";

  function focusable(root) {
    if (!root) return [];
    return Array.prototype.slice
      .call(
        root.querySelectorAll(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      )
      .filter(function (el) {
        return el.getAttribute("aria-hidden") !== "true";
      });
  }

  function init() {
    var btn = document.getElementById("bb-apex-menu-btn");
    var drawer = document.getElementById("bb-apex-drawer");
    if (!btn || !drawer) return;

    var panel = drawer.querySelector(".bb-apex-drawer__panel");
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
      if (drawer.hasAttribute("hidden")) return;

      if (ev.key === "Escape") {
        setOpen(false);
        return;
      }

      if (ev.key !== "Tab" || !panel) return;
      var nodes = focusable(panel);
      if (!nodes.length) return;
      var first = nodes[0];
      var last = nodes[nodes.length - 1];
      if (ev.shiftKey && document.activeElement === first) {
        ev.preventDefault();
        last.focus();
      } else if (!ev.shiftKey && document.activeElement === last) {
        ev.preventDefault();
        first.focus();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

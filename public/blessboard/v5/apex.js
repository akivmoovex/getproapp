/**
 * Apex marketing shell — mobile drawer (CSP-compatible external script).
 */
(function () {
  "use strict";

  var OPEN_LABEL = "Open navigation";
  var CLOSE_LABEL = "Close navigation";
  var DESKTOP_MQ = "(min-width: 900px)";

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
    var desktopMq =
      typeof window.matchMedia === "function" ? window.matchMedia(DESKTOP_MQ) : null;

    function isOpen() {
      return !drawer.hasAttribute("hidden");
    }

    function setOpen(open) {
      if (open) {
        drawer.removeAttribute("hidden");
        drawer.removeAttribute("inert");
        drawer.classList.add("is-open");
        btn.setAttribute("aria-expanded", "true");
        btn.setAttribute("aria-label", CLOSE_LABEL);
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
        drawer.setAttribute("inert", "");
        drawer.classList.remove("is-open");
        btn.setAttribute("aria-expanded", "false");
        btn.setAttribute("aria-label", OPEN_LABEL);
        document.documentElement.classList.remove("bb-apex-drawer-open");
        try {
          btn.focus();
        } catch (_) {
          /* ignore */
        }
      }
    }

    btn.addEventListener("click", function () {
      setOpen(!isOpen());
    });

    drawer.querySelectorAll("[data-bb-apex-drawer-close]").forEach(function (el) {
      el.addEventListener("click", function () {
        setOpen(false);
      });
    });

    drawer.addEventListener("click", function (ev) {
      var target = ev.target;
      if (!target || !target.closest) return;
      var link = target.closest("a[href]");
      if (!link || !drawer.contains(link)) return;
      if (ev.defaultPrevented || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      setOpen(false);
    });

    document.addEventListener("keydown", function (ev) {
      if (!isOpen()) return;

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

    function onDesktopChange(ev) {
      if (ev && ev.matches && isOpen()) setOpen(false);
    }

    if (desktopMq) {
      if (typeof desktopMq.addEventListener === "function") {
        desktopMq.addEventListener("change", onDesktopChange);
      } else if (typeof desktopMq.addListener === "function") {
        desktopMq.addListener(onDesktopChange);
      }
    }
  }

  function initPrintReceipt() {
    document.querySelectorAll("[data-bb-print-receipt]").forEach(function (el) {
      el.addEventListener("click", function () {
        window.print();
      });
    });
  }

  function boot() {
    init();
    initPrintReceipt();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

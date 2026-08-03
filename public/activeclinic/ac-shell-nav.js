/**
 * ActiveClinic shell mobile drawer (AC-V6-10).
 * Escape closes, backdrop closes, focus trap, body scroll lock.
 */
(function () {
  "use strict";

  var DESKTOP_MQ = "(min-width: 900px)";

  function focusableIn(root) {
    return Array.prototype.slice
      .call(
        root.querySelectorAll(
          'a[href], button:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'
        )
      )
      .filter(function (el) {
        return el.getAttribute("aria-hidden") !== "true" && !el.hasAttribute("disabled");
      });
  }

  function init() {
    var toggle = document.querySelector("[data-ac-nav-toggle]");
    var drawer = document.querySelector("[data-ac-nav-drawer]");
    var backdrop = document.querySelector("[data-ac-nav-backdrop]");
    var live = document.getElementById("ac-shell-nav-live");
    if (!toggle || !drawer) return;

    var lastFocus = null;

    function setOpen(open) {
      document.body.classList.toggle("ac-drawer-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      drawer.setAttribute("aria-hidden", open ? "false" : "true");
      if (backdrop) backdrop.hidden = !open;
      if (live) live.textContent = open ? "Navigation menu opened" : "Navigation menu closed";
      if (open) {
        lastFocus = document.activeElement;
        var focusables = focusableIn(drawer);
        if (focusables[0]) focusables[0].focus();
      } else if (lastFocus && typeof lastFocus.focus === "function") {
        lastFocus.focus();
      }
    }

    function isDesktop() {
      return window.matchMedia(DESKTOP_MQ).matches;
    }

    toggle.addEventListener("click", function () {
      if (isDesktop()) return;
      setOpen(!document.body.classList.contains("ac-drawer-open"));
    });

    var closeBtn = document.querySelector("[data-ac-nav-close]");
    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        setOpen(false);
      });
    }

    if (backdrop) {
      backdrop.addEventListener("click", function () {
        setOpen(false);
      });
    }

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && document.body.classList.contains("ac-drawer-open")) {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab" || !document.body.classList.contains("ac-drawer-open")) return;
      var items = focusableIn(drawer);
      if (!items.length) return;
      var first = items[0];
      var last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });

    window.matchMedia(DESKTOP_MQ).addEventListener("change", function (ev) {
      if (ev.matches) setOpen(false);
    });

    drawer.setAttribute("aria-hidden", "true");
    if (backdrop) backdrop.hidden = true;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

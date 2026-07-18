/**
 * Shared mobile drawer helpers for BlessBoard V5 admin / member shells.
 * Escape closes, body scroll locks via caller class, focus returns to toggle.
 */
(function (global) {
  "use strict";

  /**
   * @param {{
   *   toggleSelector?: string,
   *   drawerId: string,
   *   bodyOpenClass: string,
   * }} opts
   */
  function bindShellDrawer(opts) {
    var toggle = document.querySelector(
      opts.toggleSelector || '[data-bb-nav="mobile-toggle"]'
    );
    var drawer = document.getElementById(opts.drawerId);
    if (!toggle || !drawer) return null;

    var closeBtn = drawer.querySelector('[data-bb-nav="drawer-close"][aria-label], .bb-hq-drawer__close, .bb-ba-drawer__close, .bb-mp-drawer__close, .bb-pa-drawer__close');

    function isOpen() {
      return !drawer.hidden;
    }

    function setOpen(open) {
      drawer.hidden = !open;
      drawer.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      document.body.classList.toggle(opts.bodyOpenClass, open);
      if (open) {
        drawer.removeAttribute("inert");
        drawer.setAttribute("aria-modal", "true");
        if (!drawer.getAttribute("role")) drawer.setAttribute("role", "dialog");
        if (!drawer.getAttribute("aria-label")) drawer.setAttribute("aria-label", "Menu");
        var focusTarget =
          drawer.querySelector('[data-bb-nav="drawer-close"][aria-label]') ||
          closeBtn ||
          drawer.querySelector("a, button");
        if (focusTarget) {
          try {
            focusTarget.focus();
          } catch (e) {
            /* ignore */
          }
        }
      } else {
        drawer.setAttribute("inert", "");
        drawer.removeAttribute("aria-modal");
        try {
          toggle.focus();
        } catch (e) {
          /* ignore */
        }
      }
    }

    toggle.addEventListener("click", function () {
      setOpen(!isOpen());
    });

    drawer.querySelectorAll('[data-bb-nav="drawer-close"]').forEach(function (el) {
      el.addEventListener("click", function () {
        setOpen(false);
      });
    });

    document.addEventListener("keydown", function (ev) {
      if (!isOpen()) return;
      if (ev.key === "Escape") {
        ev.preventDefault();
        setOpen(false);
        return;
      }
      if (ev.key !== "Tab") return;
      var nodes = Array.prototype.slice.call(
        drawer.querySelectorAll(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
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

    return { setOpen: setOpen, isOpen: isOpen };
  }

  global.BlessBoardShellNav = { bindShellDrawer: bindShellDrawer };
})(typeof window !== "undefined" ? window : globalThis);

/**
 * Shared mobile drawer helpers for BlessBoard V5 admin / member shells.
 * Escape closes, body scroll locks via caller class, focus returns to toggle.
 * Progressive enhancement — safe no-op when toggle/drawer are absent.
 */
(function (global) {
  "use strict";

  var DEFAULT_DESKTOP_MQ = "(min-width: 900px)";

  /**
   * @param {Element} drawer
   * @returns {HTMLElement[]}
   */
  function focusableIn(drawer) {
    return Array.prototype.slice.call(
      drawer.querySelectorAll(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter(function (el) {
      return !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true";
    });
  }

  /**
   * @param {{
   *   toggleSelector?: string,
   *   drawerId: string,
   *   bodyOpenClass: string,
   *   desktopMediaQuery?: string,
   *   openLabel?: string,
   *   closeLabel?: string,
   *   closeOnNavigate?: boolean,
   * }} opts
   */
  function bindShellDrawer(opts) {
    if (!opts || !opts.drawerId || !opts.bodyOpenClass) return null;

    var toggle = document.querySelector(
      opts.toggleSelector || '[data-bb-nav="mobile-toggle"]'
    );
    var drawer = document.getElementById(opts.drawerId);
    if (!toggle || !drawer) return null;

    var openLabel = opts.openLabel || toggle.getAttribute("aria-label") || "Open navigation";
    var closeLabel = opts.closeLabel || "Close navigation";
    var closeOnNavigate = opts.closeOnNavigate !== false;
    var desktopMq =
      typeof global.matchMedia === "function"
        ? global.matchMedia(opts.desktopMediaQuery || DEFAULT_DESKTOP_MQ)
        : null;

    var closeBtn = drawer.querySelector(
      '[data-bb-nav="drawer-close"][aria-label], .bb-hq-drawer__close, .bb-ba-drawer__close, .bb-mp-drawer__close, .bb-pa-drawer__close'
    );
    var live = document.getElementById("bb-shell-nav-live");

    function announce(message) {
      if (!live) return;
      live.textContent = "";
      // Force a DOM change so polite live regions re-announce.
      global.setTimeout(function () {
        live.textContent = message;
      }, 10);
    }

    function isOpen() {
      return !drawer.hidden;
    }

    function setOpen(open) {
      var wasOpen = isOpen();
      drawer.hidden = !open;
      drawer.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-label", open ? closeLabel : openLabel);
      document.body.classList.toggle(opts.bodyOpenClass, open);

      if (open) {
        drawer.removeAttribute("inert");
        drawer.setAttribute("aria-modal", "true");
        if (!drawer.getAttribute("role")) drawer.setAttribute("role", "dialog");
        if (!drawer.getAttribute("aria-label")) {
          drawer.setAttribute("aria-label", "Menu");
        }
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
        if (!wasOpen) announce("Navigation opened");
      } else {
        drawer.setAttribute("inert", "");
        drawer.removeAttribute("aria-modal");
        try {
          toggle.focus();
        } catch (e) {
          /* ignore */
        }
        if (wasOpen) announce("Navigation closed");
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

    if (closeOnNavigate) {
      drawer.addEventListener("click", function (ev) {
        var target = ev.target;
        if (!target || !target.closest) return;
        var link = target.closest("a[href]");
        if (!link || !drawer.contains(link)) return;
        // Allow modified clicks (new tab) without forcing close animation work.
        if (ev.defaultPrevented || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) {
          return;
        }
        setOpen(false);
      });
    }

    document.addEventListener("keydown", function (ev) {
      if (!isOpen()) return;
      if (ev.key === "Escape") {
        ev.preventDefault();
        setOpen(false);
        return;
      }
      if (ev.key !== "Tab") return;
      var nodes = focusableIn(drawer);
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

    return { setOpen: setOpen, isOpen: isOpen };
  }

  global.BlessBoardShellNav = { bindShellDrawer: bindShellDrawer };
})(typeof window !== "undefined" ? window : globalThis);

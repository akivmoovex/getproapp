/**
 * BlessBoard V5 tenant public shell — accessible mobile drawer.
 * No analytics or third-party scripts.
 */
(function () {
  "use strict";

  var btn = document.getElementById("bb-tp-menu-btn");
  var drawer = document.getElementById("bb-tp-drawer");
  var overlay = document.getElementById("bb-tp-drawer-overlay");
  var closeBtn = document.getElementById("bb-tp-drawer-close");
  if (!btn || !drawer || !overlay) return;

  function prefersReducedMotion() {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (_) {
      return false;
    }
  }

  function focusableInDrawer() {
    return drawer.querySelectorAll(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
  }

  function setDrawerInert(isInert) {
    if (isInert) {
      drawer.setAttribute("inert", "");
      drawer.setAttribute("aria-hidden", "true");
    } else {
      drawer.removeAttribute("inert");
      drawer.setAttribute("aria-hidden", "false");
    }
  }

  function openDrawer() {
    drawer.classList.add("is-open");
    overlay.hidden = false;
    overlay.classList.add("is-open");
    setDrawerInert(false);
    btn.setAttribute("aria-expanded", "true");
    btn.setAttribute("aria-label", "Close navigation");
    document.documentElement.classList.add("bb-tp-drawer-open");
    var focusTarget = closeBtn || focusableInDrawer()[0];
    if (focusTarget) {
      try {
        focusTarget.focus();
      } catch (_) {
        /* ignore */
      }
    }
  }

  function closeDrawer() {
    drawer.classList.remove("is-open");
    overlay.classList.remove("is-open");
    setDrawerInert(true);
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-label", "Open navigation");
    document.documentElement.classList.remove("bb-tp-drawer-open");
    var hideDelay = prefersReducedMotion() ? 0 : 200;
    window.setTimeout(function () {
      if (!drawer.classList.contains("is-open")) overlay.hidden = true;
    }, hideDelay);
    try {
      btn.focus();
    } catch (_) {
      /* ignore */
    }
  }

  btn.addEventListener("click", function () {
    if (drawer.classList.contains("is-open")) closeDrawer();
    else openDrawer();
  });
  if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
  overlay.addEventListener("click", closeDrawer);

  document.addEventListener("keydown", function (e) {
    if (!drawer.classList.contains("is-open")) return;
    if (e.key === "Escape") {
      closeDrawer();
      return;
    }
    if (e.key !== "Tab") return;
    var nodes = Array.prototype.slice.call(focusableInDrawer());
    if (!nodes.length) return;
    var first = nodes[0];
    var last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  drawer.querySelectorAll("a").forEach(function (link) {
    link.addEventListener("click", closeDrawer);
  });

  window.addEventListener("resize", function () {
    if (window.matchMedia("(min-width: 900px)").matches && drawer.classList.contains("is-open")) {
      closeDrawer();
    }
  });
})();

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

/**
 * Branch switcher: close other open switchers; close on outside click / Escape.
 * Does not cover main content permanently — panel is absolutely positioned with max-height.
 */
(function () {
  "use strict";

  var switchers = Array.prototype.slice.call(
    document.querySelectorAll("[data-bb-branch-switcher='1']")
  );
  if (!switchers.length) return;

  function closeAll(except) {
    switchers.forEach(function (el) {
      if (el !== except && el.open) el.open = false;
    });
  }

  switchers.forEach(function (el) {
    el.addEventListener("toggle", function () {
      if (el.open) closeAll(el);
    });
  });

  document.addEventListener("click", function (e) {
    var target = e.target;
    if (!target || !target.closest) return;
    if (target.closest("[data-bb-branch-switcher='1']")) return;
    closeAll(null);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeAll(null);
  });
})();

/**
 * Giving page: copy published payment references (account/wallet numbers only).
 * Announces result via aria-live region; never copies scrubbed/redacted secrets UI text as a special case.
 */
(function () {
  "use strict";

  var root = document.querySelector("[data-bb-giving='1']");
  if (!root) return;

  var statusEl = root.querySelector("[data-bb-copy-status='1']");

  function setStatus(message) {
    if (!statusEl) return;
    statusEl.textContent = message || "";
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (ok) resolve();
        else reject(new Error("copy failed"));
      } catch (err) {
        reject(err);
      }
    });
  }

  root.addEventListener("click", function (event) {
    var btn = event.target && event.target.closest
      ? event.target.closest("[data-bb-copy-ref='1']")
      : null;
    if (!btn || !root.contains(btn)) return;

    var wrap = btn.closest(".bb-tp-giving-card__ref-value") || btn.parentElement;
    var textEl = wrap ? wrap.querySelector("[data-bb-giving-ref='1']") : null;
    var value = textEl ? String(textEl.textContent || "").trim() : "";
    if (!value || /\[redacted\]/i.test(value)) {
      setStatus("Nothing to copy");
      return;
    }

    copyText(value)
      .then(function () {
        btn.classList.add("is-copied");
        var label = btn.querySelector(".bb-tp-giving-card__copy-text");
        var prev = label ? label.textContent : "";
        if (label) label.textContent = "Copied";
        setStatus("Copied payment reference to clipboard");
        window.setTimeout(function () {
          btn.classList.remove("is-copied");
          if (label) label.textContent = prev || "Copy";
          setStatus("");
        }, 1600);
      })
      .catch(function () {
        setStatus("Could not copy. Select the reference and copy manually.");
      });
  });
})();

/**
 * ActiveClinic shared accessibility helpers (Phase 9).
 * Table header scope + reusable focus trap for drawers/sheets.
 */
(function () {
  "use strict";

  function isVisible(el) {
    if (!el || el.hidden || el.getAttribute("aria-hidden") === "true") return false;
    if (el.closest && el.closest("[hidden]")) return false;
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }

  function focusableIn(root) {
    if (!root) return [];
    return Array.prototype.slice
      .call(
        root.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      )
      .filter(isVisible);
  }

  function trapTab(ev, root) {
    if (!ev || ev.key !== "Tab" || !root) return;
    var items = focusableIn(root);
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    if (ev.shiftKey && document.activeElement === first) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && document.activeElement === last) {
      ev.preventDefault();
      first.focus();
    }
  }

  function enhanceTables(root) {
    var scope = root || document;
    scope.querySelectorAll("thead th:not([scope])").forEach(function (th) {
      th.setAttribute("scope", "col");
    });
    scope.querySelectorAll("tbody th:not([scope])").forEach(function (th) {
      th.setAttribute("scope", "row");
    });
  }

  window.acA11y = {
    focusableIn: focusableIn,
    trapTab: trapTab,
    enhanceTables: enhanceTables,
  };

  function boot() {
    enhanceTables(document);
  }

  document.addEventListener("submit", function (e) {
    var form = e.target;
    if (!form || !form.matches || !form.matches("form[data-ac-loading]")) return;
    if (form.getAttribute("aria-busy") === "true") {
      e.preventDefault();
      return;
    }
    var btn = form.querySelector('button[type="submit"]:not([disabled])');
    if (!btn) return;
    form.setAttribute("aria-busy", "true");
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    var loading = btn.getAttribute("data-loading") || "Please wait…";
    if (!btn.getAttribute("data-original-label")) {
      btn.setAttribute("data-original-label", btn.textContent.trim());
    }
    btn.textContent = loading;
    var live =
      document.getElementById("ac-form-busy-live") ||
      document.getElementById("ac-public-live") ||
      document.getElementById("ac-patient-live");
    if (live) live.textContent = loading;
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

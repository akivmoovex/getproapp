/**
 * Safe auth UI helpers only — no network calls, no credential handling.
 * - Focus error summary after validation failures
 * - Toggle password visibility (aria-pressed)
 */
(function () {
  "use strict";

  function focusErrorSummary() {
    var summary = document.getElementById("bb-auth-error-summary");
    if (!summary) return;
    try {
      summary.focus();
    } catch (_) {
      /* ignore */
    }
  }

  function bindPasswordToggles(root) {
    var buttons = (root || document).querySelectorAll("[data-bb-auth-password-toggle]");
    buttons.forEach(function (btn) {
      if (btn.getAttribute("data-bb-bound") === "1") return;
      btn.setAttribute("data-bb-bound", "1");
      btn.addEventListener("click", function () {
        var targetId = btn.getAttribute("aria-controls");
        var input = targetId ? document.getElementById(targetId) : null;
        if (!input) return;
        var show = input.getAttribute("type") === "password";
        input.setAttribute("type", show ? "text" : "password");
        btn.setAttribute("aria-pressed", show ? "true" : "false");
        var icon = btn.querySelector(".material-symbols-outlined");
        if (icon) icon.textContent = show ? "visibility_off" : "visibility";
        var label = btn.querySelector(".bb-auth-password__toggle-label");
        if (label) label.textContent = show ? "Hide password" : "Show password";
        btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
      });
    });
  }

  function init() {
    focusErrorSummary();
    bindPasswordToggles(document);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

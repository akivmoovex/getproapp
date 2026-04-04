/**
 * Dev-only guard: warn on .btn-styled <button> missing .c-button (system Button partial).
 * Skips chrome without .btn (e.g. modal close, carousel arrows).
 */
(function () {
  function warn(msg) {
    console.warn("[getpro/ui-guard] " + msg);
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("button").forEach(function (el) {
      var cls = el.className && String(el.className);
      if (!cls) return;
      var tokens = cls.split(/\s+/);
      var usesBtn = tokens.indexOf("btn") !== -1 || tokens.some(function (t) { return t.indexOf("btn--") === 0; });
      if (usesBtn && !el.classList.contains("c-button")) {
        warn("Use system component: Button (expected .c-button from partials/components/button.ejs).");
      }
    });
  });
})();

/**
 * ActiveClinic auth UI helpers (password visibility, signing-in overlay, clinic search).
 */
(function () {
  "use strict";

  document.addEventListener("click", function (e) {
    var btn = e.target && e.target.closest("[data-ac-toggle-password]");
    if (!btn) return;
    e.preventDefault();
    var id = btn.getAttribute("data-ac-toggle-password");
    var input = id ? document.getElementById(id) : null;
    if (!input) return;
    var showing = input.type === "text";
    input.type = showing ? "password" : "text";
    btn.setAttribute("aria-pressed", showing ? "false" : "true");
    btn.setAttribute(
      "aria-label",
      showing ? "Show password" : "Hide password"
    );
    var label = btn.querySelector("[data-ac-toggle-label]");
    if (label) label.textContent = showing ? "Show" : "Hide";
  });

  function showSigningIn() {
    var overlay = document.querySelector("[data-ac-signing-in]");
    if (!overlay) return;
    overlay.hidden = false;
    overlay.setAttribute("aria-busy", "true");
    var live = document.getElementById("ac-form-busy-live");
    if (live) live.textContent = "Signing you in...";
  }

  document.addEventListener("submit", function (e) {
    var form = e.target;
    if (!form || !form.matches) return;
    if (form.matches("[data-ac-login-form], [data-ac-org-select]")) {
      showSigningIn();
    }
  });

  function bindClinicFilter() {
    var input = document.querySelector("[data-ac-clinic-filter]");
    if (!input) return;
    var empty = document.querySelector("[data-ac-clinic-empty]");
    input.addEventListener("input", function () {
      var q = String(input.value || "").trim().toLowerCase();
      var cards = document.querySelectorAll("[data-ac-clinic-card]");
      var shown = 0;
      cards.forEach(function (card) {
        var label = String(card.getAttribute("data-ac-clinic-label") || "");
        var match = !q || label.indexOf(q) !== -1;
        card.hidden = !match;
        if (match) shown += 1;
      });
      if (empty) empty.hidden = shown !== 0;
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindClinicFilter);
  } else {
    bindClinicFilter();
  }
})();

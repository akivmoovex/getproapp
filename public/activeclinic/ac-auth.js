/**
 * ActiveClinic auth UI helpers (password visibility + submit loading).
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

  document.addEventListener("submit", function (e) {
    var form = e.target;
    if (!form || !form.matches("form[data-ac-loading]")) return;
    var btn = form.querySelector('button[type="submit"]');
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    var loading = btn.getAttribute("data-loading") || "Please wait…";
    if (!btn.getAttribute("data-original-label")) {
      btn.setAttribute("data-original-label", btn.textContent.trim());
    }
    btn.textContent = loading;
  });
})();

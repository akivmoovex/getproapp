/**
 * ActiveClinic auth/app UI helpers (password visibility + submit loading).
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
    var live = document.getElementById("ac-form-busy-live");
    if (live) live.textContent = loading;
  });
})();

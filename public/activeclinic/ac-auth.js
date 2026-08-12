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
})();

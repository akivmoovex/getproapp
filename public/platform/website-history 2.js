/**
 * Shared website version history restore confirmation (Wave 4B-1).
 */
(function () {
  "use strict";

  var host = document.querySelector("[data-gp-website-history]");
  if (!host) return;

  var dialogHost = host.querySelector("[data-gp-history-dialog-host]");
  var panel = host.querySelector('[data-gp-history-panel="restore"]');
  var overlay = host.querySelector("[data-gp-history-overlay]");
  var versionLabel = host.querySelector("[data-gp-history-restore-version]");
  var pendingForm = null;

  function openDialog(form) {
    if (!dialogHost || !panel || !form) return;
    pendingForm = form;
    var label = form.getAttribute("data-gp-history-version-label") || "This version";
    if (versionLabel) {
      versionLabel.textContent = "Restore " + label + "? ";
    }
    dialogHost.hidden = false;
    if (overlay) overlay.hidden = false;
    panel.hidden = false;
    document.body.classList.add("gp-we-history-dialog-open");
    var focusable = panel.querySelector("button");
    if (focusable && focusable.focus) focusable.focus();
  }

  function closeDialog() {
    if (!dialogHost) return;
    dialogHost.hidden = true;
    if (overlay) overlay.hidden = true;
    if (panel) panel.hidden = true;
    pendingForm = null;
    document.body.classList.remove("gp-we-history-dialog-open");
  }

  host.addEventListener("click", function (event) {
    var openBtn = event.target.closest("[data-gp-history-restore-open]");
    if (openBtn) {
      event.preventDefault();
      var form = openBtn.closest("[data-gp-history-restore-form]");
      openDialog(form);
      return;
    }
    if (event.target.closest("[data-gp-history-dismiss]")) {
      event.preventDefault();
      closeDialog();
      return;
    }
    if (event.target.closest("[data-gp-history-restore-confirm]")) {
      event.preventDefault();
      if (!pendingForm) return;
      var submit = pendingForm.querySelector('button[type="button"]');
      if (submit) submit.disabled = true;
      pendingForm.submit();
      return;
    }
    if (event.target === overlay) {
      closeDialog();
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && dialogHost && !dialogHost.hidden) {
      closeDialog();
    }
  });
})();

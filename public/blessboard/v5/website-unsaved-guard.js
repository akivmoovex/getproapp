/**
 * Phase 7 Stage 6 — unsaved active-field warning (client-only).
 * Saved draft changes alone must never trigger this dialog.
 */
(function (global) {
  "use strict";

  var pendingNavigate = null;
  var activeController = null;

  function dialog() {
    return document.querySelector("[data-bb-unsaved-dialog='1']");
  }

  function hasActiveUnsaved() {
    return Boolean(activeController && typeof activeController.isDirty === "function" && activeController.isDirty());
  }

  function setActiveController(controller) {
    activeController = controller || null;
  }

  function clearActiveController(controller) {
    if (!controller || activeController === controller) activeController = null;
  }

  function openDialog(navigateFn) {
    var el = dialog();
    if (!el || typeof el.showModal !== "function") {
      if (window.confirm("You have unsaved changes. Discard them before leaving?")) {
        if (activeController && typeof activeController.discard === "function") {
          activeController.discard();
        }
        clearActiveController();
        if (typeof navigateFn === "function") navigateFn();
      }
      return;
    }
    pendingNavigate = navigateFn || null;
    el.showModal();
  }

  function closeDialog() {
    var el = dialog();
    if (el && typeof el.close === "function") el.close();
    pendingNavigate = null;
  }

  function guardNavigation(navigateFn) {
    if (!hasActiveUnsaved()) {
      if (typeof navigateFn === "function") navigateFn();
      return;
    }
    openDialog(navigateFn);
  }

  function onDialogClose(event) {
    var el = dialog();
    if (!el) return;
    var value = el.returnValue;
    if (value === "continue") {
      pendingNavigate = null;
      return;
    }
    if (value === "discard") {
      if (activeController && typeof activeController.discard === "function") {
        activeController.discard();
      }
      clearActiveController();
      var goDiscard = pendingNavigate;
      pendingNavigate = null;
      if (typeof goDiscard === "function") goDiscard();
      return;
    }
    if (value === "save") {
      var goSave = pendingNavigate;
      pendingNavigate = null;
      if (activeController && typeof activeController.save === "function") {
        Promise.resolve(activeController.save())
          .then(function (ok) {
            if (ok === false) return;
            clearActiveController();
            if (typeof goSave === "function") goSave();
          })
          .catch(function () {
            /* keep editing */
          });
        return;
      }
      clearActiveController();
      if (typeof goSave === "function") goSave();
    }
  }

  function onDocumentClick(event) {
    var link = event.target.closest("a[href]");
    if (!link) return;
    if (link.hasAttribute("data-bb-unsaved-ignore")) return;
    if (!hasActiveUnsaved()) return;
    var href = link.getAttribute("href");
    if (!href || href.charAt(0) === "#") return;
    // Same-page hash / javascript: ignore
    if (/^javascript:/i.test(href)) return;
    event.preventDefault();
    var url = link.href;
    guardNavigation(function () {
      window.location.href = url;
    });
  }

  function onBeforeUnload(event) {
    if (!hasActiveUnsaved()) return;
    event.preventDefault();
    event.returnValue = "";
  }

  document.addEventListener("click", onDocumentClick, true);
  window.addEventListener("beforeunload", onBeforeUnload);

  document.addEventListener("DOMContentLoaded", function () {
    var el = dialog();
    if (!el) return;
    el.addEventListener("close", onDialogClose);
    el.addEventListener("cancel", function (event) {
      // Esc → continue editing (do not navigate away)
      event.preventDefault();
      pendingNavigate = null;
      if (typeof el.close === "function") el.close("continue");
    });
  });

  global.BbWebsiteUnsavedGuard = {
    setActiveController: setActiveController,
    clearActiveController: clearActiveController,
    hasActiveUnsaved: hasActiveUnsaved,
    guardNavigation: guardNavigation,
  };
})(window);

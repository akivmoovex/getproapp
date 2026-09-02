"use strict";

(function (global) {
  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function initRegistrationConsent(config) {
    config = config || {};
    var form =
      typeof config.form === "string" ? qs(config.form) : config.form || document.querySelector("[data-gp-registration-form]");
    if (!form) return null;

    var consentInput =
      typeof config.consentInput === "string"
        ? qs(config.consentInput, form)
        : config.consentInput || qs("[name='registration_consent']", form);
    var errorEl =
      typeof config.errorEl === "string"
        ? qs(config.errorEl, form)
        : config.errorEl || qs("[data-gp-consent-error]", form);
    var submitButtons = form.querySelectorAll("[type='submit'], button[data-gp-registration-submit]");

    function clearError() {
      if (!errorEl) return;
      errorEl.hidden = true;
      errorEl.textContent = "";
      if (consentInput) consentInput.closest(".gp-registration-consent")?.classList.remove("is-error");
    }

    function showError(message) {
      if (!errorEl) return;
      errorEl.hidden = false;
      errorEl.textContent = message || "Please confirm that you agree to the Terms of Service and Privacy Policy.";
      if (consentInput) {
        consentInput.closest(".gp-registration-consent")?.classList.add("is-error");
        consentInput.focus();
      }
    }

    if (consentInput) {
      consentInput.addEventListener("change", function () {
        if (consentInput.checked) clearError();
      });
    }

    form.addEventListener("submit", function (ev) {
      if (!consentInput || consentInput.checked) return;
      var step = form.getAttribute("data-bb-register-step") || form.getAttribute("data-ac-register-step");
      if (step && step !== "review") return;
      ev.preventDefault();
      showError();
    });

    return { clearError: clearError, showError: showError };
  }

  global.GpRegistrationConsent = {
    init: initRegistrationConsent,
  };
})(typeof window !== "undefined" ? window : globalThis);

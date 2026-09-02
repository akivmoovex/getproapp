"use strict";

(function (global) {
  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function initRegistrationPasswordRules(config) {
    config = config || {};
    var passwordInput =
      typeof config.passwordInput === "string"
        ? qs(config.passwordInput)
        : config.passwordInput;
    var confirmInput =
      typeof config.confirmInput === "string"
        ? qs(config.confirmInput)
        : config.confirmInput;
    var rulesRoot =
      typeof config.rulesRoot === "string" ? qs(config.rulesRoot) : config.rulesRoot;
    var confirmStatus =
      typeof config.confirmStatus === "string"
        ? qs(config.confirmStatus)
        : config.confirmStatus;
    if (!passwordInput || !rulesRoot) return null;

    var minLength = Number(config.minLength) > 0 ? Number(config.minLength) : 10;
    var maxLength = Number(config.maxLength) > 0 ? Number(config.maxLength) : 200;
    var ruleItems = rulesRoot.querySelectorAll("[data-gp-password-rule]");

    function renderConfirmStatus() {
      if (!confirmStatus || !confirmInput) return;
      var password = String(passwordInput.value || "");
      var confirm = String(confirmInput.value || "");
      confirmStatus.classList.remove("is-met", "is-unmet");
      if (!confirm.length) {
        confirmStatus.textContent = "";
        return;
      }
      if (password === confirm) {
        confirmStatus.textContent = "Passwords match";
        confirmStatus.classList.add("is-met");
      } else {
        confirmStatus.textContent = "Passwords do not match yet";
        confirmStatus.classList.add("is-unmet");
      }
    }

    function render() {
      var value = String(passwordInput.value || "");
      var allMet = true;
      ruleItems.forEach(function (item) {
        var ruleId = item.getAttribute("data-gp-password-rule") || "";
        var met = false;
        if (ruleId === "min_length") met = value.length >= minLength;
        else if (ruleId === "max_length") met = value.length <= maxLength;
        item.classList.toggle("is-met", met);
        item.classList.toggle("is-unmet", !met);
        item.setAttribute("aria-checked", met ? "true" : "false");
        if (!met) allMet = false;
      });
      rulesRoot.setAttribute(
        "aria-label",
        allMet ? "All password requirements met" : "Password requirements not yet met"
      );
      renderConfirmStatus();
    }

    passwordInput.addEventListener("input", render);
    passwordInput.addEventListener("blur", render);
    if (confirmInput) {
      confirmInput.addEventListener("input", render);
      confirmInput.addEventListener("blur", render);
    }
    render();
    return { refresh: render };
  }

  global.GpRegistrationPasswordRules = {
    init: initRegistrationPasswordRules,
  };
})(typeof window !== "undefined" ? window : globalThis);

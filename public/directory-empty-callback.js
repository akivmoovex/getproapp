(function () {
  "use strict";

  /* PERF: Loaded only when directory has zero results (views/directory.ejs). Do not add this script to result pages. */

  function tenantSlugFromDataset(form) {
    return String(form.dataset.tenantSlug || "").trim();
  }

  function tenantIdFromDataset(form) {
    const n = Number(form.dataset.tenantId);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function isValidName(s) {
    const t = String(s || "").trim();
    return t.length >= 3 && /^[a-zA-Z\s]+$/.test(t);
  }

  function phoneRules() {
    const r = window.__GETPRO_PHONE_RULES__;
    return r && typeof r === "object"
      ? r
      : { strict: false, regex: null, normalizationMode: "generic_digits", regexBroken: false };
  }

  function isValidPhoneForTenant(slug, raw) {
    const r = phoneRules();
    const t = String(raw || "").trim();
    if (!t) return false;
    const digits = t.replace(/\D/g, "");
    if (r.regexBroken) return digits.length >= 5;
    if (r.strict && r.regex) {
      try {
        return new RegExp(r.regex).test(t);
      } catch {
        return digits.length >= 5;
      }
    }
    if (!r.strict) {
      return digits.length >= 5;
    }
    return digits.length >= 5;
  }

  function phoneErrorHint() {
    const r = phoneRules();
    if (r.strict && r.regex && !r.regexBroken) {
      return "Enter a phone number in the format required for this region.";
    }
    return "Enter a valid phone number (at least 5 digits).";
  }

  const form = document.getElementById("directory-empty-callback-form");
  if (!form) return;

  const messageBlock = document.getElementById("directory-empty-message-block");
  const panel = document.getElementById("directory-empty-callback-panel");
  const success = document.getElementById("directory-empty-callback-success");
  const errEl = document.getElementById("directory-empty-callback-error");
  const nameInput = document.getElementById("directory-empty-callback-name");
  const phoneInput = document.getElementById("directory-empty-callback-phone");
  const submitBtn = document.getElementById("directory-empty-callback-submit");
  const loadingEl = document.getElementById("directory-empty-callback-loading");

  const ctxInput = form.querySelector('input[name="context"]');
  const labelInput = form.querySelector('input[name="interest_label"]');

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!nameInput || !phoneInput || !errEl) return;

    const tenantId = tenantIdFromDataset(form);
    const slug = tenantSlugFromDataset(form);
    const nameVal = nameInput.value.trim();
    const phoneVal = phoneInput.value.trim();

    errEl.textContent = "";
    errEl.hidden = true;

    if (!isValidName(nameVal)) {
      errEl.textContent = "Full name must be at least 3 letters.";
      errEl.hidden = false;
      nameInput.focus();
      return;
    }
    if (!phoneVal) {
      errEl.textContent = "Phone number is required.";
      errEl.hidden = false;
      phoneInput.focus();
      return;
    }
    if (!isValidPhoneForTenant(slug, phoneVal)) {
      errEl.textContent = phoneErrorHint();
      errEl.hidden = false;
      phoneInput.focus();
      return;
    }

    const payload = {
      tenantId,
      tenantSlug: slug,
      name: nameVal,
      phone: phoneVal.slice(0, 40),
      context: ctxInput ? String(ctxInput.value || "").trim().slice(0, 120) : "directory_no_results",
      interest_label: labelInput ? String(labelInput.value || "").trim().slice(0, 120) : "Directory — no match",
    };

    if (submitBtn) submitBtn.disabled = true;
    if (loadingEl) loadingEl.hidden = false;
    try {
      const resp = await fetch("/api/callback-interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await resp.json().catch(function () {
        return {};
      });
      if (!resp.ok) {
        errEl.textContent = data.error || "Something went wrong. Please try again.";
        errEl.hidden = false;
        return;
      }
      if (messageBlock) messageBlock.hidden = true;
      if (panel) panel.hidden = true;
      if (success) {
        success.hidden = false;
        success.focus();
      }
      form.reset();
    } catch (_) {
      errEl.textContent = "Network error. Please try again.";
      errEl.hidden = false;
    } finally {
      if (loadingEl) loadingEl.hidden = true;
      if (submitBtn) submitBtn.disabled = false;
    }
  });
})();

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

  function isValidPhoneZm(raw) {
    const d = String(raw || "").replace(/\D/g, "");
    return d.length === 10 && /^0\d{9}$/.test(d);
  }

  function isValidPhoneForTenant(slug, raw) {
    if (slug === "zm") return isValidPhoneZm(raw);
    return !!String(raw || "").trim();
  }

  function phoneErrorHint(slug) {
    if (slug === "zm") {
      return "Use a Zambian mobile number: 0 and 9 digits (10 digits total, e.g. 0977123456).";
    }
    return "Enter a valid phone number.";
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
      errEl.textContent = phoneErrorHint(slug);
      errEl.hidden = false;
      phoneInput.focus();
      return;
    }

    const digits = phoneVal.replace(/\D/g, "").slice(0, 20);
    const payload = {
      tenantId,
      tenantSlug: slug,
      name: nameVal,
      phone: digits,
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

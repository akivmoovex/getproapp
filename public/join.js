(function () {
  const LIST_URL = "/data/search-lists.json?v=20260329e";

  function tenantSlug() {
    if (typeof window.__GETPRO_TENANT_SLUG__ === "string" && window.__GETPRO_TENANT_SLUG__) {
      return window.__GETPRO_TENANT_SLUG__;
    }
    return "";
  }

  function tenantIdNum() {
    const n = Number(window.__GETPRO_TENANT_ID__);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function homeUrl() {
    return (typeof window.__GETPRO_HOME__ === "string" && window.__GETPRO_HOME__) || "/";
  }

  /** Zambia: 10 digits starting with 0 (local mobile); second digit 7 or 9. Three digits allowed for quick tests. */
  function isValidPhoneZm(raw) {
    const d = String(raw || "").replace(/\D/g, "");
    if (d.length === 3) return true;
    if (d.length !== 10) return false;
    if (!d.startsWith("0")) return false;
    return /^[79]/.test(d.charAt(1));
  }

  /** Israel: mobile without +972 — 9 digits starting 5, or 10 with leading 0 */
  function isValidPhoneIl(raw) {
    const d = String(raw || "").replace(/\D/g, "");
    if (d.length === 9 && /^5[0-9]/.test(d)) return true;
    if (d.length === 10 && d.startsWith("0") && d.charAt(1) === "5") return true;
    return false;
  }

  function isValidPhoneForTenant(raw) {
    const slug = tenantSlug();
    if (!slug) {
      const d = String(raw || "").replace(/\D/g, "");
      return d.length >= 8;
    }
    if (slug === "zm") return isValidPhoneZm(raw);
    if (slug === "il") return isValidPhoneIl(raw);
    const d = String(raw || "").replace(/\D/g, "");
    return d.length >= 8;
  }

  function phoneErrorHint() {
    const slug = tenantSlug();
    if (!slug) return "Enter a valid phone number.";
    if (slug === "zm") {
      return "Enter a Zambian mobile with a leading 0 (10 digits, e.g. 0977123456). Use 3 digits only for quick tests.";
    }
    if (slug === "il") return "Enter a valid Israeli mobile number (without +972).";
    return "Invalid phone number.";
  }

  const wizardFrame = document.getElementById("join-wizard-frame");
  const wizard = document.getElementById("join-wizard");
  const wizardInner = document.getElementById("join-wizard-inner");
  const progressWrap = document.getElementById("join-progress-wrap");
  const getStarted = document.getElementById("join-get-started");
  const topBrand = document.getElementById("join-top-brand");
  const stepNum = document.getElementById("join-step-num");
  const progressFill = document.getElementById("join-progress-fill");
  const step3Form = document.getElementById("join-step-3-form");
  const step3Thanks = document.getElementById("join-step-3-thanks");
  const exitModal = document.getElementById("join-exit-modal");
  const exitModalQ = document.getElementById("join-exit-modal-q");
  const exitModalForm = document.getElementById("join-exit-modal-form");
  const exitModalDismiss = document.getElementById("join-exit-modal-dismiss");
  const exitModalCall = document.getElementById("join-exit-modal-call");
  const exitModalBack = document.getElementById("join-exit-modal-back");
  const exitModalSubmit = document.getElementById("join-exit-modal-submit");
  const exitModalName = document.getElementById("join-exit-modal-name");
  const exitModalPhone = document.getElementById("join-exit-modal-phone");
  const exitModalError = document.getElementById("join-exit-modal-error");

  const disabledCityModal = document.getElementById("join-disabled-city-modal");
  const disabledCityLabel = document.getElementById("join-disabled-city-label");
  const disabledCityName = document.getElementById("join-disabled-city-name");
  const disabledCityPhone = document.getElementById("join-disabled-city-phone");
  const disabledCityError = document.getElementById("join-disabled-city-error");
  const disabledCitySubmit = document.getElementById("join-disabled-city-submit");
  const disabledCityDismiss = document.getElementById("join-disabled-city-dismiss");
  const disabledCityPanel = document.getElementById("join-disabled-city-panel");
  const disabledCityThanks = document.getElementById("join-disabled-city-thanks");
  const disabledCityClose = document.getElementById("join-disabled-city-close");

  const steps = {
    1: document.getElementById("join-step-1"),
    2: document.getElementById("join-step-2"),
    3: document.getElementById("join-step-3"),
  };

  const professionInput = document.getElementById("join-profession");
  const professionHid = document.getElementById("join-profession-hid");
  const cityInput = document.getElementById("join-city");
  const cityHid = document.getElementById("join-city-hid");
  const name = document.getElementById("join-name");
  const phone = document.getElementById("join-phone");

  if (!getStarted || !wizard) return;

  let currentStep = 1;
  let listsCache = null;

  function norm(s) {
    return String(s || "")
      .trim()
      .toLowerCase();
  }

  function exactMatch(pool, typed) {
    const n = norm(typed);
    if (!n) return null;
    for (let i = 0; i < pool.length; i++) {
      if (norm(pool[i]) === n) return pool[i];
    }
    return null;
  }

  async function getLists() {
    if (!listsCache) {
      const r = await fetch(LIST_URL);
      if (!r.ok) throw new Error("Could not load lists");
      listsCache = await r.json();
    }
    return listsCache;
  }

  function tenantCityRows() {
    const tc = typeof window !== "undefined" && window.__GETPRO_TENANT_CITIES__;
    return Array.isArray(tc) ? tc : [];
  }

  function cityPoolForStep2(lists) {
    const rows = tenantCityRows();
    if (rows.length) return rows.map((c) => c.name);
    return lists.cities;
  }

  function isCityDisabledByName(cityCanonical) {
    const rows = tenantCityRows();
    if (!rows.length) return false;
    const n = norm(cityCanonical);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (norm(r.name) === n) {
        return r.enabled === 0 || r.enabled === false;
      }
    }
    return false;
  }

  function resetDisabledCityForm() {
    if (disabledCityName) disabledCityName.value = "";
    if (disabledCityPhone) disabledCityPhone.value = "";
    if (disabledCityError) {
      disabledCityError.textContent = "";
      disabledCityError.hidden = true;
    }
  }

  function openDisabledCityModal(cityName) {
    if (!disabledCityModal || !disabledCityLabel) return;
    disabledCityLabel.textContent = cityName;
    resetDisabledCityForm();
    if (disabledCityPanel) disabledCityPanel.hidden = false;
    if (disabledCityThanks) disabledCityThanks.hidden = true;
    disabledCityModal.hidden = false;
    document.body.classList.add("join-modal-open");
    disabledCityName?.focus();
  }

  function closeDisabledCityModal() {
    if (!disabledCityModal) return;
    disabledCityModal.hidden = true;
    document.body.classList.remove("join-modal-open");
    resetDisabledCityForm();
    if (disabledCityPanel) disabledCityPanel.hidden = false;
    if (disabledCityThanks) disabledCityThanks.hidden = true;
  }

  function ensureAc(wrap, pool) {
    const input = wrap.querySelector(".pro-ac-input");
    const hidden = wrap.querySelector(".pro-ac-hidden");
    const msg = wrap.querySelector(".pro-ac-msg");
    if (!input || !hidden) return { ok: false, value: "" };

    const typed = (input.value || "").trim();
    if (!typed) {
      if (msg) {
        msg.textContent = "Type at least one letter and choose from the list.";
        msg.hidden = false;
      }
      return { ok: false, value: "" };
    }

    if (hidden.dataset.valid === "1" && hidden.value && norm(input.value) === norm(hidden.value)) {
      if (msg) msg.hidden = true;
      return { ok: true, value: hidden.value };
    }

    const exact = exactMatch(pool, typed);
    if (exact) {
      hidden.value = exact;
      hidden.dataset.valid = "1";
      input.value = exact;
      if (msg) msg.hidden = true;
      return { ok: true, value: exact };
    }

    if (msg) {
      msg.textContent =
        wrap.getAttribute("data-ac-list") === "city"
          ? "Choose a town or city from the list."
          : "Choose a professional service from the list.";
      msg.hidden = false;
    }
    return { ok: false, value: "" };
  }

  function setProgress(n) {
    if (stepNum) stepNum.textContent = String(n);
    if (progressFill) progressFill.style.width = `${(n / 3) * 100}%`;
  }

  function restartJoinWatermarks() {
    document.querySelectorAll("#join-panels .pro-ac").forEach((w) => {
      w.dispatchEvent(new CustomEvent("getpro-restart-watermark"));
    });
  }

  function showStep(n) {
    currentStep = n;
    setProgress(n);
    Object.keys(steps).forEach((k) => {
      const el = steps[k];
      if (el) el.hidden = Number(k) !== n;
    });
  }

  function showError(step, msg) {
    const el = document.getElementById(`join-error-${step}`);
    if (!el) return;
    el.textContent = msg || "";
    el.hidden = !msg;
  }

  function clearErrors() {
    for (let i = 1; i <= 3; i++) showError(i, "");
  }

  function isRegistrationInProgress() {
    if (!wizardFrame || wizardFrame.hidden) return false;
    if (step3Thanks && !step3Thanks.hidden) return false;
    return true;
  }

  function showExitModalQuestion() {
    if (exitModalQ) exitModalQ.hidden = false;
    if (exitModalForm) exitModalForm.hidden = true;
    if (exitModalError) {
      exitModalError.textContent = "";
      exitModalError.hidden = true;
    }
  }

  function showExitModalForm() {
    if (exitModalQ) exitModalQ.hidden = true;
    if (exitModalForm) exitModalForm.hidden = false;
    if (exitModalError) {
      exitModalError.textContent = "";
      exitModalError.hidden = true;
    }
    exitModalName?.focus();
  }

  function openExitModal() {
    if (!exitModal) return;
    showExitModalQuestion();
    exitModal.hidden = false;
    document.body.classList.add("join-modal-open");
    exitModalDismiss?.focus();
  }

  function closeExitModal() {
    if (!exitModal) return;
    exitModal.hidden = true;
    document.body.classList.remove("join-modal-open");
    showExitModalQuestion();
    if (exitModalName) exitModalName.value = "";
    if (exitModalPhone) exitModalPhone.value = "";
  }

  function isValidName(s) {
    const t = String(s || "").trim();
    return t.length >= 3 && /^[a-zA-Z\s]+$/.test(t);
  }

  topBrand?.addEventListener("click", (e) => {
    if (isRegistrationInProgress()) {
      e.preventDefault();
      openExitModal();
    }
  });

  exitModalDismiss?.addEventListener("click", () => {
    closeExitModal();
    window.location.href = homeUrl();
  });

  exitModalCall?.addEventListener("click", () => {
    showExitModalForm();
  });

  exitModalBack?.addEventListener("click", () => {
    showExitModalQuestion();
  });

  exitModalSubmit?.addEventListener("click", async () => {
    if (!exitModalName || !exitModalPhone || !exitModalError) return;
    const nameVal = exitModalName.value.trim();
    const phoneVal = exitModalPhone.value.trim();
    if (!isValidName(nameVal)) {
      exitModalError.textContent = "Name must be at least 3 letters.";
      exitModalError.hidden = false;
      return;
    }
    if (!isValidPhoneForTenant(phoneVal)) {
      exitModalError.textContent = phoneErrorHint();
      exitModalError.hidden = false;
      return;
    }
    exitModalError.hidden = true;
    if (!tenantIdNum()) {
      exitModalError.textContent = "Missing region on this page. Refresh and try again.";
      exitModalError.hidden = false;
      return;
    }
    const digits = phoneVal.replace(/\D/g, "").slice(0, 20);
    try {
      await fetch("/api/callback-interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: tenantIdNum(),
          tenantSlug: tenantSlug(),
          name: nameVal,
          phone: digits,
          context: "join_exit_call_request",
          interest_label: "Potential Partner",
        }),
      });
    } catch (_) {
      /* still go home */
    }
    closeExitModal();
    window.location.href = homeUrl();
  });

  exitModal?.addEventListener("click", (e) => {
    if (e.target === exitModal) closeExitModal();
  });

  disabledCityDismiss?.addEventListener("click", () => closeDisabledCityModal());
  disabledCityClose?.addEventListener("click", () => closeDisabledCityModal());
  disabledCityModal?.addEventListener("click", (e) => {
    if (e.target === disabledCityModal) closeDisabledCityModal();
  });

  disabledCitySubmit?.addEventListener("click", async () => {
    if (!disabledCityName || !disabledCityPhone || !disabledCityError) return;
    const nameVal = disabledCityName.value.trim();
    const phoneVal = disabledCityPhone.value.trim();
    if (!isValidName(nameVal)) {
      disabledCityError.textContent = "Name must be at least 3 letters.";
      disabledCityError.hidden = false;
      return;
    }
    if (!isValidPhoneForTenant(phoneVal)) {
      disabledCityError.textContent = phoneErrorHint();
      disabledCityError.hidden = false;
      return;
    }
    if (!tenantIdNum()) {
      disabledCityError.textContent = "Missing region on this page. Refresh and try again.";
      disabledCityError.hidden = false;
      return;
    }
    const cityName = String(disabledCityLabel?.textContent || "").trim();
    const digits = phoneVal.replace(/\D/g, "").slice(0, 20);
    try {
      await fetch("/api/callback-interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: tenantIdNum(),
          tenantSlug: tenantSlug(),
          name: nameVal,
          phone: digits,
          context: "disabled_city_waitlist",
          cityName,
        }),
      });
    } catch (_) {
      /* still show thanks */
    }
    if (disabledCityPanel) disabledCityPanel.hidden = true;
    if (disabledCityThanks) disabledCityThanks.hidden = false;
    disabledCityClose?.focus();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (disabledCityModal && !disabledCityModal.hidden) {
      e.preventDefault();
      closeDisabledCityModal();
      return;
    }
    if (!exitModal || exitModal.hidden) return;
    if (exitModalForm && !exitModalForm.hidden) {
      showExitModalQuestion();
      return;
    }
    closeExitModal();
  });

  document.getElementById("join-cancel-1")?.addEventListener("click", () => {
    if (isRegistrationInProgress()) openExitModal();
  });

  getStarted.addEventListener("click", () => {
    if (getStarted) getStarted.hidden = true;
    if (wizardFrame) wizardFrame.hidden = false;
    wizard.classList.remove("join-wizard--hidden");
    wizard.setAttribute("aria-hidden", "false");
    showStep(1);
    clearErrors();
    wizardFrame?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        restartJoinWatermarks();
      }, 380);
    });
    window.setTimeout(() => restartJoinWatermarks(), 900);
  });

  document.getElementById("join-next-1")?.addEventListener("click", async () => {
    showError(1, "");
    try {
      const lists = await getLists();
      const wrap = document.querySelector("#join-step-1 .pro-ac");
      if (!wrap) return;
      const r = ensureAc(wrap, lists.services);
      if (!r.ok) return;
      showStep(2);
      cityInput?.focus();
    } catch (e) {
      showError(1, e.message || "Could not validate. Try again.");
    }
  });

  document.getElementById("join-back-2")?.addEventListener("click", () => showStep(1));

  document.getElementById("join-next-2")?.addEventListener("click", async () => {
    showError(2, "");
    try {
      const lists = await getLists();
      const wrap = document.querySelector("#join-step-2 .pro-ac");
      if (!wrap) return;
      const pool = cityPoolForStep2(lists);
      const r = ensureAc(wrap, pool);
      if (!r.ok) return;
      if (isCityDisabledByName(r.value)) {
        openDisabledCityModal(r.value);
        return;
      }
      showStep(3);
      name?.focus();
    } catch (e) {
      showError(2, e.message || "Could not validate. Try again.");
    }
  });

  document.getElementById("join-back-3")?.addEventListener("click", () => showStep(2));

  document.getElementById("join-submit")?.addEventListener("click", async () => {
    showError(3, "");

    const nameVal = (name.value || "").trim();
    const phoneVal = (phone.value || "").trim();

    if (!isValidName(nameVal)) {
      showError(3, "Incorrect name.");
      return;
    }
    if (!isValidPhoneForTenant(phoneVal)) {
      showError(3, phoneErrorHint());
      return;
    }

    const prof =
      (professionHid && professionHid.value) || (professionInput && professionInput.value.trim()) || "";
    const cityVal = (cityHid && cityHid.value) || (cityInput && cityInput.value.trim()) || "";

    if (!tenantIdNum()) {
      showError(3, "Missing region on this page. Refresh and try again.");
      return;
    }

    const payload = {
      tenantId: tenantIdNum(),
      tenantSlug: tenantSlug(),
      profession: prof,
      city: cityVal,
      name: nameVal,
      phone: phoneVal.replace(/\D/g, "").slice(0, 20),
      vat_or_pacra: "",
    };

    const submitBtn = document.getElementById("join-submit");
    if (submitBtn) submitBtn.disabled = true;

    try {
      const resp = await fetch("/api/professional-signups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data.error || `Request failed (${resp.status})`);
      }

      showStep(3);
      if (step3Form) step3Form.hidden = true;
      if (step3Thanks) step3Thanks.hidden = false;
      if (progressWrap) progressWrap.hidden = true;
      if (wizardInner) wizardInner.classList.add("join-wizard-inner--thanks");
    } catch (err) {
      showError(3, err.message || "Something went wrong. Please try again.");
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
})();

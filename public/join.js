(function () {
  const LIST_URL = "/data/search-lists.json?v=20260324a";

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

  /** Brief demo: type sample letters so the dropdown shows matches (once per session per step). */
  function maybeRunAcDemo(step) {
    const key = step === 1 ? "joinDemoAc1" : "joinDemoAc2";
    if (sessionStorage.getItem(key)) return;
    const inp = step === 1 ? professionInput : cityInput;
    if (!inp) return;
    const demoVal = step === 1 ? "elec" : "lus";
    window.setTimeout(() => {
      if (inp.value.trim()) return;
      sessionStorage.setItem(key, "1");
      inp.value = demoVal;
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      inp.focus();
      window.setTimeout(() => {
        if (inp.value === demoVal) {
          inp.value = "";
          inp.dispatchEvent(new Event("input", { bubbles: true }));
          inp.blur();
          restartJoinWatermarks();
        }
      }, 2800);
    }, 900);
  }

  function showStep(n) {
    currentStep = n;
    setProgress(n);
    Object.keys(steps).forEach((k) => {
      const el = steps[k];
      if (el) el.hidden = Number(k) !== n;
    });
    if (n === 1) maybeRunAcDemo(1);
    if (n === 2) maybeRunAcDemo(2);
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

  function isValidPhone(s) {
    const digits = String(s || "").replace(/\D/g, "");
    return digits.length >= 8;
  }

  topBrand?.addEventListener("click", (e) => {
    if (isRegistrationInProgress()) {
      e.preventDefault();
      openExitModal();
    }
  });

  exitModalDismiss?.addEventListener("click", () => closeExitModal());

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
    if (!isValidPhone(phoneVal)) {
      exitModalError.textContent = "Invalid phone number.";
      exitModalError.hidden = false;
      return;
    }
    exitModalError.hidden = true;
    try {
      await fetch("/api/callback-interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nameVal,
          phone: phoneVal.replace(/\D/g, "").slice(0, 20),
          context: "join_exit_call_request",
        }),
      });
    } catch (_) {
      /* still go home */
    }
    closeExitModal();
    window.location.href = "/";
  });

  exitModal?.addEventListener("click", (e) => {
    if (e.target === exitModal) closeExitModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !exitModal || exitModal.hidden) return;
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
    /* Watermark typewriter: do not focus the field (focus stops the animation). Restart after paint. */
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
      const r = ensureAc(wrap, lists.cities);
      if (!r.ok) return;
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
    if (!isValidPhone(phoneVal)) {
      showError(3, "Invalid phone number.");
      return;
    }

    const prof =
      (professionHid && professionHid.value) || (professionInput && professionInput.value.trim()) || "";
    const cityVal = (cityHid && cityHid.value) || (cityInput && cityInput.value.trim()) || "";

    const payload = {
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

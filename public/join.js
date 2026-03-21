(function () {
  const LIST_URL = "/data/search-lists.json?v=20260320p";

  const hero = document.getElementById("join-hero");
  const wizard = document.getElementById("join-wizard");
  const getStarted = document.getElementById("join-get-started");
  const stepNum = document.getElementById("join-step-num");
  const progressFill = document.getElementById("join-progress-fill");
  const panels = document.getElementById("join-panels");
  const thanks = document.getElementById("join-thanks");

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

  /**
   * Profession/city must be in list — same as home page. Blocks proceed if not chosen from list.
   */
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

  /** Name: letters (and spaces) only, at least 3 characters */
  function isValidName(s) {
    const t = String(s || "").trim();
    return t.length >= 3 && /^[a-zA-Z\s]+$/.test(t);
  }

  /** Phone: digits only, at least 8 digits */
  function isValidPhone(s) {
    const digits = String(s || "").replace(/\D/g, "");
    return digits.length >= 8;
  }

  getStarted.addEventListener("click", () => {
    if (hero) hero.classList.add("join-hero--hidden");
    wizard.classList.remove("join-wizard--hidden");
    wizard.setAttribute("aria-hidden", "false");
    showStep(1);
    clearErrors();
    wizard.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => professionInput?.focus(), 350);
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
      showError(3, "Name must contain only letters and be at least 3 characters.");
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

      if (panels) panels.hidden = true;
      if (thanks) {
        thanks.hidden = false;
        const prog = wizard.querySelector(".join-progress");
        const track = wizard.querySelector(".join-progress-track");
        if (prog) prog.hidden = true;
        if (track) track.hidden = true;
      }
    } catch (err) {
      showError(3, err.message || "Something went wrong. Please try again.");
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
})();

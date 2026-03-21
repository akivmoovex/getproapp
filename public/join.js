(function () {
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
    4: document.getElementById("join-step-4"),
  };

  const profession = document.getElementById("join-profession");
  const city = document.getElementById("join-city");
  const name = document.getElementById("join-name");
  const phone = document.getElementById("join-phone");

  if (!getStarted || !wizard) return;

  let currentStep = 1;

  function setProgress(n) {
    if (stepNum) stepNum.textContent = String(n);
    if (progressFill) progressFill.style.width = `${Math.min(n, 4) * 25}%`;
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
    for (let i = 1; i <= 4; i++) showError(i, "");
  }

  getStarted.addEventListener("click", () => {
    if (hero) hero.classList.add("join-hero--hidden");
    wizard.classList.remove("join-wizard--hidden");
    wizard.setAttribute("aria-hidden", "false");
    showStep(1);
    clearErrors();
    wizard.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => profession.focus(), 350);
  });

  document.getElementById("join-next-1")?.addEventListener("click", () => {
    showError(1, "");
    const v = (profession.value || "").trim();
    if (!v) {
      showError(1, "Please enter your profession.");
      return;
    }
    showStep(2);
    city.focus();
  });

  document.getElementById("join-back-2")?.addEventListener("click", () => showStep(1));

  document.getElementById("join-next-2")?.addEventListener("click", () => {
    showError(2, "");
    const v = (city.value || "").trim();
    if (!v) {
      showError(2, "Please enter your city or town.");
      return;
    }
    showStep(3);
    name.focus();
  });

  document.getElementById("join-back-3")?.addEventListener("click", () => showStep(2));

  document.getElementById("join-next-3")?.addEventListener("click", () => {
    showError(3, "");
    const n = (name.value || "").trim();
    const p = (phone.value || "").trim();
    if (!n) {
      showError(3, "Please enter your name.");
      return;
    }
    if (!p) {
      showError(3, "Please enter your phone number.");
      return;
    }
    showStep(4);
  });

  document.getElementById("join-back-4")?.addEventListener("click", () => showStep(3));

  document.getElementById("join-submit")?.addEventListener("click", async () => {
    showError(4, "");
    const radio = document.querySelector('input[name="vat_pacra"]:checked');
    const vatOrPacra = radio ? radio.value : "";

    const payload = {
      profession: (profession.value || "").trim(),
      city: (city.value || "").trim(),
      name: (name.value || "").trim(),
      phone: (phone.value || "").trim(),
      vat_or_pacra: vatOrPacra,
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
      showError(4, err.message || "Something went wrong. Please try again.");
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
})();

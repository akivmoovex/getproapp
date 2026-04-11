(function () {
  if (typeof window.__getproInitSearchAutocomplete === "function") {
    window.__getproInitSearchAutocomplete();
  }

  var wizard = document.getElementById("fa-wizard");
  if (!wizard) return;

  var totalSteps = 5;
  var stepNumEl = document.getElementById("fa-step-num");
  var progressFill = document.getElementById("fa-progress-fill");
  var panels = {
    1: document.getElementById("fa-step-1"),
    2: document.getElementById("fa-step-2"),
    3: document.getElementById("fa-step-3"),
    4: document.getElementById("fa-step-4"),
    5: document.getElementById("fa-step-5"),
  };

  var phoneEl = document.getElementById("fa-phone");
  var firstEl = document.getElementById("fa-first-name");
  var lastEl = document.getElementById("fa-last-name");
  var waEl = document.getElementById("fa-whatsapp");
  var copyWaBtn = document.getElementById("fa-copy-phone-wa");
  var formEl = document.getElementById("fa-submit-form");
  var err1 = document.getElementById("fa-error-1");

  var checkUrl =
    typeof window.__FA_CHECK_PHONE_URL__ === "string" ? window.__FA_CHECK_PHONE_URL__ : "/field-agent/api/check-phone";

  var currentStep = 1;

  function phoneRules() {
    var r = window.__GETPRO_PHONE_RULES__;
    return r && typeof r === "object"
      ? r
      : { strict: false, regex: null, normalizationMode: "generic_digits", regexBroken: false };
  }

  function isValidPhoneForTenant(raw) {
    var r = phoneRules();
    var t = String(raw || "").trim();
    if (!t) return false;
    var digits = t.replace(/\D/g, "");
    if (r.regexBroken) return digits.length >= 5;
    if (r.strict && r.regex) {
      try {
        return new RegExp(r.regex).test(t);
      } catch (e) {
        return digits.length >= 5;
      }
    }
    if (!r.strict) {
      return digits.length >= 5;
    }
    return digits.length >= 5;
  }

  function phoneErrHint() {
    var r = phoneRules();
    if (r.strict && r.regex && !r.regexBroken) {
      return "Enter a phone number in the format required for this region.";
    }
    return "Enter a valid phone number (at least 5 digits).";
  }

  function showStep(n) {
    currentStep = n;
    if (stepNumEl) stepNumEl.textContent = String(n);
    if (progressFill) progressFill.style.width = String((100 * (n - 1)) / (totalSteps - 1)) + "%";
    for (var k in panels) {
      if (!panels[k]) continue;
      var on = Number(k) === n;
      panels[k].hidden = !on;
    }
  }

  function showErr1(msg) {
    if (!err1) return;
    if (msg) {
      err1.textContent = msg;
      err1.hidden = false;
    } else {
      err1.textContent = "";
      err1.hidden = true;
    }
  }

  document.getElementById("fa-next-1").addEventListener("click", function () {
    showErr1("");
    var phone = phoneEl && phoneEl.value ? phoneEl.value.trim() : "";
    if (!isValidPhoneForTenant(phone)) {
      showErr1(phoneErrHint());
      return;
    }
    fetch(checkUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ phone: phone }),
    })
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, json: j };
        });
      })
      .then(function (x) {
        if (!x.ok || !x.json || !x.json.ok) {
          showErr1("Could not verify phone. Try again.");
          return;
        }
        if (x.json.duplicate) {
          showErr1(x.json.message || "Service provider exists in system.");
          return;
        }
        showStep(2);
      })
      .catch(function () {
        showErr1("Network error. Try again.");
      });
  });

  document.getElementById("fa-back-2").addEventListener("click", function () {
    showStep(1);
  });
  document.getElementById("fa-next-2").addEventListener("click", function () {
    var fn = firstEl && firstEl.value ? firstEl.value.trim() : "";
    var ln = lastEl && lastEl.value ? lastEl.value.trim() : "";
    var err2 = document.getElementById("fa-error-2");
    if (!fn || !ln) {
      if (err2) {
        err2.textContent = "Enter first and last name.";
        err2.hidden = false;
      }
      return;
    }
    if (err2) err2.hidden = true;
    showStep(3);
  });

  document.getElementById("fa-back-3").addEventListener("click", function () {
    showStep(2);
  });
  document.getElementById("fa-next-3").addEventListener("click", function () {
    var prof =
      document.getElementById("fa-profession") &&
      document.getElementById("fa-profession").value &&
      document.getElementById("fa-profession").value.trim();
    var acity =
      document.getElementById("fa-address-city") &&
      document.getElementById("fa-address-city").value &&
      document.getElementById("fa-address-city").value.trim();
    var err3 = document.getElementById("fa-error-3");
    if (!prof || !acity) {
      if (err3) {
        err3.textContent = "Please complete profession and address city.";
        err3.hidden = false;
      }
      return;
    }
    if (err3) err3.hidden = true;
    showStep(4);
  });

  document.getElementById("fa-back-4").addEventListener("click", function () {
    showStep(3);
  });
  document.getElementById("fa-next-4").addEventListener("click", function () {
    var nrc = document.getElementById("fa-nrc");
    var nrcv = nrc && nrc.value ? nrc.value.trim() : "";
    if (!nrcv) return;
    showStep(5);
  });

  document.getElementById("fa-back-5").addEventListener("click", function () {
    showStep(4);
  });

  if (copyWaBtn && phoneEl && waEl) {
    copyWaBtn.addEventListener("click", function () {
      waEl.value = phoneEl.value || "";
    });
  }

  if (formEl) {
    formEl.addEventListener("submit", function (e) {
      var works = document.getElementById("fa-works");
      var n = works && works.files ? works.files.length : 0;
      if (n > 10) {
        e.preventDefault();
        var err5 = document.getElementById("fa-error-5");
        if (err5) {
          err5.textContent = "Please upload at most 10 work photos.";
          err5.hidden = false;
        }
      }
    });
  }

  showStep(1);
})();

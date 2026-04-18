(function () {
  if (typeof window.__getproInitSearchAutocomplete === "function") {
    window.__getproInitSearchAutocomplete();
  }

  var wizard = document.getElementById("fa-wizard");
  if (!wizard) return;

  var totalSteps = 6;
  var stepNumEl = document.getElementById("fa-step-num");
  var progressFill = document.getElementById("fa-progress-fill");
  var panels = {
    1: document.getElementById("fa-step-1"),
    2: document.getElementById("fa-step-2"),
    3: document.getElementById("fa-step-3"),
    4: document.getElementById("fa-step-4"),
    5: document.getElementById("fa-step-5"),
    6: document.getElementById("fa-step-6"),
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

  var MAX_REVIEW_LINE_LEN = 700;

  function setRevLine(elId, label, raw) {
    var el = document.getElementById(elId);
    if (!el) return;
    var v = raw == null ? "" : String(raw).trim();
    var line = label + " — " + (v ? v : "—");
    if (line.length > MAX_REVIEW_LINE_LEN) {
      line = line.slice(0, MAX_REVIEW_LINE_LEN - 1) + "…";
    }
    el.textContent = line;
  }

  function fillReviewSummary() {
    var phone = phoneEl && phoneEl.value ? phoneEl.value.trim() : "";
    var fn = firstEl && firstEl.value ? firstEl.value.trim() : "";
    var ln = lastEl && lastEl.value ? lastEl.value.trim() : "";
    var wa = waEl && waEl.value ? waEl.value.trim() : "";
    var profEl = document.getElementById("fa-profession");
    var profession = profEl && profEl.value ? profEl.value.trim() : "";
    var pacEl = document.getElementById("fa-pacra");
    var pacra = pacEl && pacEl.value ? pacEl.value.trim() : "";
    var stEl = document.getElementById("fa-address-street");
    var street = stEl && stEl.value ? stEl.value.trim() : "";
    var lmEl = document.getElementById("fa-address-landmarks");
    var landmarks = lmEl && lmEl.value ? lmEl.value.trim() : "";
    var nbEl = document.getElementById("fa-address-neighbourhood");
    var neighbourhood = nbEl && nbEl.value ? nbEl.value.trim() : "";
    var cityEl = document.getElementById("fa-address-city");
    var city = cityEl && cityEl.value ? cityEl.value.trim() : "";
    var nrcEl = document.getElementById("fa-nrc");
    var nrc = nrcEl && nrcEl.value ? nrcEl.value.trim() : "";
    var profFile = document.getElementById("fa-profile");
    var profileSummary = "";
    if (profFile && profFile.files && profFile.files.length) {
      profileSummary = profFile.files[0].name;
    }
    var worksIn = document.getElementById("fa-works");
    var worksSummary = "";
    if (worksIn && worksIn.files && worksIn.files.length) {
      var names = [];
      for (var wi = 0; wi < worksIn.files.length; wi++) {
        names.push(worksIn.files[wi].name);
      }
      worksSummary = worksIn.files.length + " file(s): " + names.join(", ");
    }

    setRevLine("fa-rev-line-phone", "Phone", phone);
    setRevLine("fa-rev-line-name", "Name", (fn || ln ? fn + (fn && ln ? " " : "") + ln : "").trim());
    setRevLine("fa-rev-line-whatsapp", "WhatsApp", wa);
    setRevLine("fa-rev-line-profession", "Service or profession", profession);
    setRevLine("fa-rev-line-pacra", "PACRA / business ID", pacra);
    setRevLine("fa-rev-line-street", "Street address", street);
    setRevLine("fa-rev-line-landmarks", "Landmarks", landmarks);
    setRevLine("fa-rev-line-neighbourhood", "Neighbourhood", neighbourhood);
    setRevLine("fa-rev-line-city", "Address city", city);
    setRevLine("fa-rev-line-nrc", "NRC number", nrc);
    setRevLine("fa-rev-line-profile", "Profile photo", profileSummary);
    setRevLine("fa-rev-line-works", "Work photos", worksSummary);
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
    if (n === 6) fillReviewSummary();
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

  document.getElementById("fa-next-5").addEventListener("click", function () {
    var works = document.getElementById("fa-works");
    var nfiles = works && works.files ? works.files.length : 0;
    if (nfiles > 10) {
      var err5 = document.getElementById("fa-error-5");
      if (err5) {
        err5.textContent = "Please upload at most 10 work photos.";
        err5.hidden = false;
      }
      return;
    }
    var err5b = document.getElementById("fa-error-5");
    if (err5b) err5b.hidden = true;
    showStep(6);
  });

  document.getElementById("fa-back-6").addEventListener("click", function () {
    showStep(5);
  });

  document.getElementById("fa-cancel-6").addEventListener("click", function () {
    showStep(1);
  });

  if (copyWaBtn && phoneEl && waEl) {
    copyWaBtn.addEventListener("click", function () {
      waEl.value = phoneEl.value || "";
    });
  }

  var submitInFlight = false;
  var successNavTimer = null;
  var pendingSuccessUrl = "";
  var successNavigationStarted = false;

  function setReviewNavDisabled(disabled) {
    var b = document.getElementById("fa-back-6");
    var c = document.getElementById("fa-cancel-6");
    if (b) b.disabled = !!disabled;
    if (c) c.disabled = !!disabled;
  }

  function hideSubmitError() {
    var el = document.getElementById("fa-error-submit");
    if (el) {
      el.textContent = "";
      el.hidden = true;
    }
  }

  function showSubmitError(msg) {
    var el = document.getElementById("fa-error-submit");
    if (el) {
      el.textContent = msg || "Something went wrong. Try again.";
      el.hidden = false;
    }
  }

  function clearSuccessNavTimer() {
    if (successNavTimer) {
      clearTimeout(successNavTimer);
      successNavTimer = null;
    }
  }

  function setSuccessOverlayOpen(open) {
    var o = document.getElementById("fa-submit-success-overlay");
    if (!o) return;
    if (open) {
      o.removeAttribute("hidden");
      o.setAttribute("aria-hidden", "false");
      void o.offsetWidth;
      o.classList.add("m3-modal-overlay--open");
      document.body.classList.add("join-modal-open");
      var dlg = document.getElementById("fa-submit-success-dialog");
      if (dlg && typeof dlg.focus === "function") {
        try {
          dlg.focus();
        } catch (focusErr) {
          /* ignore */
        }
      }
    } else {
      o.classList.remove("m3-modal-overlay--open");
      document.body.classList.remove("join-modal-open");
      o.setAttribute("hidden", "");
      o.setAttribute("aria-hidden", "true");
    }
  }

  function restartCountdownAnimation() {
    var cd = document.getElementById("fa-submit-success-countdown");
    if (!cd) return;
    cd.classList.remove("fa-submit-success-countdown--animate");
    void cd.offsetWidth;
    cd.classList.add("fa-submit-success-countdown--animate");
  }

  function goDashboardFromSuccess() {
    if (successNavigationStarted) return;
    clearSuccessNavTimer();
    var url = pendingSuccessUrl || "";
    pendingSuccessUrl = "";
    if (!url) {
      setSuccessOverlayOpen(false);
      return;
    }
    successNavigationStarted = true;
    setSuccessOverlayOpen(false);
    window.location.assign(url);
  }

  document.querySelectorAll("[data-fa-submit-success-dismiss]").forEach(function (el) {
    el.addEventListener("click", function (e) {
      e.preventDefault();
      goDashboardFromSuccess();
    });
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    var o = document.getElementById("fa-submit-success-overlay");
    if (!o || o.hasAttribute("hidden") || !o.classList.contains("m3-modal-overlay--open")) return;
    e.preventDefault();
    goDashboardFromSuccess();
  });

  window.addEventListener("pagehide", function () {
    clearSuccessNavTimer();
  });

  if (formEl) {
    formEl.addEventListener("submit", function (e) {
      var sendBtn = document.getElementById("fa-send");
      var works = document.getElementById("fa-works");
      var n = works && works.files ? works.files.length : 0;
      if (n > 10) {
        e.preventDefault();
        var err5 = document.getElementById("fa-error-5");
        if (err5) {
          err5.textContent = "Please upload at most 10 work photos.";
          err5.hidden = false;
        }
        return;
      }
      if (currentStep !== 6) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      if (submitInFlight) return;
      submitInFlight = true;
      hideSubmitError();

      if (sendBtn) sendBtn.disabled = true;
      setReviewNavDisabled(true);
      formEl.setAttribute("aria-busy", "true");
      if (sendBtn) sendBtn.setAttribute("aria-busy", "true");

      fetch(formEl.action, {
        method: "POST",
        body: new FormData(formEl),
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
      })
        .then(function (res) {
          var status = res.status;
          var ct = (res.headers.get("content-type") || "").toLowerCase();
          return res.text().then(function (raw) {
            var out = { status: status };
            if (ct.indexOf("application/json") !== -1) {
              try {
                out.json = raw ? JSON.parse(raw) : null;
              } catch (parseErr) {
                out.jsonParseError = true;
                out.text = raw;
              }
            } else {
              out.text = raw;
            }
            return out;
          });
        })
        .then(function (result) {
          if (result.jsonParseError) {
            showSubmitError("Could not submit. Try again.");
            return;
          }
          if (result.json) {
            if (result.json.ok && result.json.redirect) {
              pendingSuccessUrl = result.json.redirect;
              setSuccessOverlayOpen(true);
              restartCountdownAnimation();
              clearSuccessNavTimer();
              successNavTimer = setTimeout(function () {
                successNavTimer = null;
                goDashboardFromSuccess();
              }, 5000);
              return;
            }
            showSubmitError(result.json.error || "Could not submit. Try again.");
            return;
          }
          if (result.text && String(result.text).trim()) {
            showSubmitError(String(result.text).trim().slice(0, 500));
            return;
          }
          showSubmitError("Could not submit. Try again.");
        })
        .catch(function () {
          showSubmitError("Network error. Try again.");
        })
        .finally(function () {
          if (!pendingSuccessUrl) {
            submitInFlight = false;
            if (sendBtn) sendBtn.disabled = false;
            if (sendBtn) sendBtn.removeAttribute("aria-busy");
            setReviewNavDisabled(false);
            formEl.removeAttribute("aria-busy");
          }
        });
    });
  }

  showStep(1);
})();

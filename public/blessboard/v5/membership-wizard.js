/**
 * BlessBoard public membership application wizard (BB03–BB06).
 * Desktop + mobile: one step visible at a time; values stay in the DOM.
 */
(function () {
  "use strict";

  var form = document.getElementById("bb-auth-form");
  if (!form) return;

  var panels = Array.prototype.slice.call(
    form.querySelectorAll("[data-bb-membership-panel]")
  );
  if (!panels.length) return;

  var body = document.body;
  var nav = form.querySelector("[data-bb-membership-step-nav]");
  var statusEl = document.querySelector("[data-bb-step-status]");
  var barFill = document.querySelector("[data-bb-wizard-bar]");
  var prevBtn = form.querySelector("[data-bb-step-prev]");
  var nextBtn = form.querySelector("[data-bb-step-next]");
  var homeLink = form.querySelector("[data-bb-step-home]");
  var errEl = form.querySelector("[data-bb-step-error]");
  var submitBtn = form.querySelector("[data-bb-membership-submit]");
  var nodes = Array.prototype.slice.call(
    document.querySelectorAll("[data-bb-wizard-node]")
  );

  var idx = 0;
  var initial = parseInt(form.getAttribute("data-bb-membership-initial-step") || "1", 10);
  if (Number.isFinite(initial) && initial >= 1) {
    var start = panels.findIndex(function (p) {
      return String(p.getAttribute("data-bb-membership-panel")) === String(initial);
    });
    if (start >= 0) idx = start;
  }

  var submitting = false;

  function panelCode(panel) {
    return panel.getAttribute("data-screen") || "BB03";
  }

  function setError(msg) {
    if (!errEl) return;
    if (!msg) {
      errEl.hidden = true;
      errEl.textContent = "";
      return;
    }
    errEl.hidden = false;
    errEl.textContent = msg;
  }

  function val(selector) {
    var el = form.querySelector(selector);
    return el && el.value != null ? String(el.value).trim() : "";
  }

  function phoneOk() {
    var e164 = val('input[name="phone_e164"], input[name="phone"]');
    var national = val('input[name="phone_national"]');
    if (e164 && e164.length >= 8) return true;
    if (national && national.replace(/\D/g, "").length >= 7) return true;
    var tel = form.querySelector('input[type="tel"]');
    if (tel && String(tel.value || "").replace(/\D/g, "").length >= 7) return true;
    return false;
  }

  function validateCurrent() {
    var panel = panels[idx];
    if (!panel) return true;
    var step = String(panel.getAttribute("data-bb-membership-panel") || "");
    setError("");

    if (step === "1") {
      var first = val("#first_name");
      var last = val("#last_name");
      if (!first) {
        setError("Enter your first name.");
        var f = form.querySelector("#first_name");
        if (f) f.focus();
        return false;
      }
      if (!last) {
        setError("Enter your last name.");
        var l = form.querySelector("#last_name");
        if (l) l.focus();
        return false;
      }
      if (!phoneOk()) {
        setError("Enter a valid mobile phone number.");
        var p = form.querySelector('input[type="tel"], input[name="phone_national"]');
        if (p) p.focus();
        return false;
      }
      var email = val("#email");
      if (email && email.indexOf("@") < 1) {
        setError("Enter a valid email address, or leave it blank.");
        var e = form.querySelector("#email");
        if (e) e.focus();
        return false;
      }
    }

    if (step === "4") {
      var consent = form.querySelector('input[name="consent_contact"]');
      if (consent && !consent.checked) {
        setError("Confirm that leadership may contact you about this application.");
        consent.focus();
        return false;
      }
    }
    return true;
  }

  function checkedInterests() {
    return Array.prototype.slice
      .call(form.querySelectorAll('input[name="interests"]:checked'))
      .map(function (el) {
        return el.value;
      })
      .join(", ");
  }

  function selectLabel(id) {
    var el = form.querySelector("#" + id);
    if (!el || !el.options || el.selectedIndex < 0) return "";
    return String(el.options[el.selectedIndex].text || "").trim();
  }

  function refreshReview() {
    function set(key, text) {
      var el = form.querySelector('[data-bb-review="' + key + '"]');
      if (el) el.textContent = text && String(text).trim() ? String(text).trim() : "—";
    }
    var name = [val("#first_name"), val("#last_name")].filter(Boolean).join(" ");
    set("name", name);
    set("preferred", val("#preferred_name"));
    set(
      "phone",
      val('input[name="phone_e164"]') ||
        val('input[name="phone"]') ||
        val('input[name="phone_national"]')
    );
    set("email", val("#email"));
    set("faith", val("#faith_background"));
    set("baptism", selectLabel("baptism_status") || val("#baptism_status"));
    set("previousChurch", val("#previous_church"));
    set("interests", checkedInterests());
    set("ministry", val("#ministry_interest"));
    set("availability", val("#availability"));
  }

  function apply() {
    var total = panels.length;
    panels.forEach(function (el, i) {
      el.hidden = i !== idx;
    });
    var current = panels[idx];
    var code = panelCode(current);
    var label =
      (current.querySelector(".bb-auth-fieldset__legend") &&
        current.querySelector(".bb-auth-fieldset__legend").textContent.replace(/\s+/g, " ").trim()) ||
      "Step";

    if (body) {
      body.setAttribute("data-screen", code);
      body.setAttribute("data-bb-screen-desktop", code + "-D");
      body.setAttribute("data-bb-screen-mobile", code + "-M");
    }

    nodes.forEach(function (node) {
      var n = parseInt(node.getAttribute("data-bb-wizard-node"), 10);
      var panelNum = parseInt(current.getAttribute("data-bb-membership-panel"), 10);
      node.classList.toggle("is-current", n === panelNum);
      node.classList.toggle("is-done", n < panelNum);
    });

    if (statusEl) {
      statusEl.textContent = "Step " + (idx + 1) + " of " + total + ": " + label;
    }
    if (barFill) {
      barFill.style.width = Math.round(((idx + 1) / total) * 100) + "%";
    }
    if (prevBtn) prevBtn.disabled = idx === 0;
    if (nextBtn) nextBtn.hidden = idx >= total - 1;
    if (homeLink) homeLink.hidden = idx < total - 1;
    if (nav) nav.hidden = false;

    if (String(current.getAttribute("data-bb-membership-panel")) === "4") {
      refreshReview();
    }

    var heading = current.querySelector("h1, legend, .bb-auth-fieldset__legend");
    if (heading && typeof heading.focus === "function") {
      try {
        current.setAttribute("tabindex", "-1");
        current.focus({ preventScroll: false });
      } catch (_) {}
    }
  }

  if (prevBtn) {
    prevBtn.addEventListener("click", function () {
      if (idx > 0) {
        idx -= 1;
        setError("");
        apply();
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", function () {
      if (!validateCurrent()) return;
      if (idx < panels.length - 1) {
        idx += 1;
        apply();
      }
    });
  }

  form.addEventListener("submit", function (ev) {
    // Ensure review step is current and valid before POST
    if (idx !== panels.length - 1) {
      ev.preventDefault();
      setError("Complete each step, then submit from Review.");
      return;
    }
    if (!validateCurrent()) {
      ev.preventDefault();
      return;
    }
    if (submitting) {
      ev.preventDefault();
      return;
    }
    submitting = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.setAttribute("aria-busy", "true");
    }
  });

  apply();
})();

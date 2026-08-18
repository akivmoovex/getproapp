/**
 * Shared mobile helpers for the unified website editor (AC + BlessBoard).
 * Keeps sticky chrome, field controls, and the software keyboard from covering
 * editable content. Product-specific save/cancel logic stays in each editor JS.
 */
(function () {
  var FIELD_SEL =
    "[data-website-inline], [data-website-key], [data-bb-inline-edit], [data-bb-structured-editor]";

  function syncKeyboardInset() {
    var vv = window.visualViewport;
    var inset = 0;
    if (vv) {
      inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    }
    document.documentElement.style.setProperty("--gp-keyboard-inset", inset + "px");
  }

  function closestField(node) {
    if (!node || !node.closest) return null;
    return node.closest(FIELD_SEL);
  }

  function setFieldEditing(active) {
    document.body.classList.toggle("gp-website-field-editing", Boolean(active));
  }

  function revealField(field) {
    if (!field || typeof field.scrollIntoView !== "function") return;
    try {
      field.scrollIntoView({ block: "center", behavior: "smooth" });
    } catch (err) {
      try {
        field.scrollIntoView(true);
      } catch (ignored) {
        /* ignore */
      }
    }
  }

  syncKeyboardInset();
  window.addEventListener("resize", syncKeyboardInset);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", syncKeyboardInset);
    window.visualViewport.addEventListener("scroll", syncKeyboardInset);
  }

  document.addEventListener("focusin", function (ev) {
    var field = closestField(ev.target);
    if (!field) return;
    setFieldEditing(true);
    revealField(field);
  });

  document.addEventListener("focusout", function () {
    window.setTimeout(function () {
      var active = document.activeElement;
      if (!closestField(active)) setFieldEditing(false);
    }, 0);
  });

  document.addEventListener("click", function (ev) {
    var start =
      ev.target &&
      ev.target.closest &&
      ev.target.closest("[data-website-start], [data-bb-inline-start], [data-bb-structured-open]");
    if (!start) return;
    var field = closestField(start);
    if (field) {
      setFieldEditing(true);
      window.setTimeout(function () {
        revealField(field);
      }, 50);
    }
  });

  document.querySelectorAll("[data-website-publish-confirm='1']").forEach(function (form) {
    form.addEventListener("submit", function (ev) {
      var message =
        form.getAttribute("data-website-publish-message") ||
        "Publish this website? Public visitors will see the current draft.";
      if (!window.confirm(message)) ev.preventDefault();
    });
  });
})();

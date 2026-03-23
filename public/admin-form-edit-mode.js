/**
 * Admin forms: READ → EDIT → Done. Dirty tracking; unsaved navigation uses M3 modal (not confirm()).
 */
(function () {
  var M3_CLOSE_MS = 280;

  var unsavedModalEl = null;
  var pendingNavUrl = null;
  var lastFocusEl = null;
  var docNavHooked = false;

  function getControlValue(el) {
    if (el.type === "checkbox") return el.checked ? "1" : "0";
    return el.value;
  }

  function setControlValue(el, val) {
    if (el.type === "checkbox") {
      el.checked = val === "1" || val === "on" || val === true;
    } else {
      el.value = val;
    }
  }

  function collectSnapshot(form) {
    var snap = {};
    form.querySelectorAll("input, textarea, select").forEach(function (el) {
      if (!el.name) return;
      if (el.type === "hidden") return;
      snap[el.name] = getControlValue(el);
    });
    return snap;
  }

  function applySnapshot(form, snap) {
    form.querySelectorAll("input, textarea, select").forEach(function (el) {
      if (!el.name) return;
      if (el.type === "hidden") return;
      if (!Object.prototype.hasOwnProperty.call(snap, el.name)) return;
      setControlValue(el, snap[el.name]);
    });
  }

  function snapshotsEqual(a, b) {
    var keys = {};
    var k;
    for (k in a) keys[k] = true;
    for (k in b) keys[k] = true;
    for (k in keys) {
      var av = a[k] != null ? String(a[k]) : "";
      var bv = b[k] != null ? String(b[k]) : "";
      if (av !== bv) return false;
    }
    return true;
  }

  function getBlockingShell() {
    var list = document.querySelectorAll("[data-admin-form-edit]");
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (s.classList.contains("is-edit-mode") && s.classList.contains("is-dirty")) return s;
    }
    return null;
  }

  function ensureUnsavedModal() {
    if (unsavedModalEl) return unsavedModalEl;
    var overlay = document.createElement("div");
    overlay.className = "m3-modal-overlay admin-form-unsaved-m3";
    overlay.setAttribute("hidden", "");
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML =
      '<div class="m3-modal-overlay__backdrop" data-admin-unsaved-dismiss tabindex="-1"></div>' +
      '<div class="m3-modal m3-modal--admin-unsaved" role="dialog" aria-modal="true" aria-labelledby="admin-unsaved-title">' +
      '<header class="m3-modal__header">' +
      '<h2 id="admin-unsaved-title" class="m3-modal__title">Discard changes?</h2>' +
      '<button type="button" class="m3-modal__close" data-admin-unsaved-dismiss aria-label="Close">×</button>' +
      "</header>" +
      '<div class="m3-modal__body">' +
      "<p>You have unsaved changes. Are you sure you want to leave?</p>" +
      "</div>" +
      '<footer class="m3-modal__footer">' +
      '<button type="button" class="btn btn--text" data-admin-unsaved-cancel>Cancel</button>' +
      '<button type="button" class="btn btn-primary" data-admin-unsaved-discard>Discard</button>' +
      "</footer>" +
      "</div>";

    document.body.appendChild(overlay);

    function openM3Modal(el) {
      if (!el) return;
      lastFocusEl = document.activeElement;
      el.removeAttribute("hidden");
      el.setAttribute("aria-hidden", "false");
      void el.offsetWidth;
      el.classList.add("m3-modal-overlay--open");
      var focusBtn = el.querySelector("[data-admin-unsaved-cancel]");
      if (focusBtn) focusBtn.focus();
    }

    function closeM3Modal(el, opts) {
      if (!el) return;
      var restoreFocus = !opts || opts.restoreFocus !== false;
      el.classList.remove("m3-modal-overlay--open");
      window.setTimeout(function () {
        if (!el.classList.contains("m3-modal-overlay--open")) {
          el.setAttribute("hidden", "hidden");
          el.setAttribute("aria-hidden", "true");
          pendingNavUrl = null;
          if (restoreFocus && lastFocusEl && typeof lastFocusEl.focus === "function") {
            try {
              lastFocusEl.focus();
            } catch (e) {}
          }
        }
      }, M3_CLOSE_MS);
    }

    function dismiss() {
      closeM3Modal(overlay);
    }

    function confirmDiscard() {
      var url = pendingNavUrl;
      pendingNavUrl = null;
      overlay.classList.remove("m3-modal-overlay--open");
      window.setTimeout(function () {
        overlay.setAttribute("hidden", "hidden");
        overlay.setAttribute("aria-hidden", "true");
        if (url) window.location.assign(url);
      }, M3_CLOSE_MS);
    }

    overlay.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest("[data-admin-unsaved-dismiss]")) dismiss();
    });

    overlay.querySelector("[data-admin-unsaved-cancel]")?.addEventListener("click", dismiss);
    overlay.querySelector("[data-admin-unsaved-discard]")?.addEventListener("click", confirmDiscard);

    document.addEventListener(
      "keydown",
      function (e) {
        if (e.key !== "Escape") return;
        if (overlay.hasAttribute("hidden")) return;
        if (!overlay.classList.contains("m3-modal-overlay--open")) return;
        e.preventDefault();
        dismiss();
      },
      true
    );

    unsavedModalEl = { overlay: overlay, open: openM3Modal, close: closeM3Modal };
    return unsavedModalEl;
  }

  function tryNavigateTo(url) {
    var m = ensureUnsavedModal();
    pendingNavUrl = url;
    m.open(m.overlay);
  }

  function hookDocumentNavigationOnce() {
    if (docNavHooked) return;
    docNavHooked = true;

    document.addEventListener(
      "click",
      function (e) {
        var shell = getBlockingShell();
        if (!shell) return;

        var a = e.target.closest && e.target.closest("a[href]");
        if (!a) return;
        if (e.defaultPrevented || e.button !== 0) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if (a.target === "_blank" || a.hasAttribute("download")) return;
        if (a.getAttribute("data-skip-unsaved-guard") != null) return;

        var href = a.getAttribute("href");
        if (!href || href.trim().charAt(0) === "#") return;
        if (/^javascript:/i.test(href.trim())) return;

        try {
          var u = new URL(a.href, window.location.href);
          if (u.origin !== window.location.origin) return;
          if (
            u.pathname === window.location.pathname &&
            u.search === window.location.search &&
            u.hash !== window.location.hash
          ) {
            return;
          }
        } catch (err) {
          return;
        }

        e.preventDefault();
        tryNavigateTo(a.href);
      },
      true
    );
  }

  function setControlsEditable(shell, editable) {
    var form = shell.querySelector("form");
    if (!form) return;
    form.querySelectorAll("input, textarea, select").forEach(function (el) {
      if (!el.name) return;
      if (el.type === "hidden") return;
      if (el.type === "checkbox") {
        el.disabled = !editable;
        el.tabIndex = editable ? 0 : -1;
      } else if (el.tagName === "SELECT") {
        el.disabled = !editable;
      } else {
        el.readOnly = !editable;
        if (el.type === "password" && !editable) el.value = "";
      }
    });
  }

  function setToolbar(shell, editing) {
    var edit = shell.querySelector(".admin-form-shell__btn--edit");
    var done = shell.querySelector(".admin-form-shell__btn--done");
    var cancel = shell.querySelector(".admin-form-shell__btn--cancel");
    var back = shell.querySelector(".admin-form-shell__back");
    if (edit) edit.hidden = editing;
    if (done) done.hidden = !editing;
    if (cancel) cancel.hidden = !editing;
    if (back) back.hidden = editing;
  }

  function refreshDirty(shell, form, initial) {
    var cur = collectSnapshot(form);
    var dirty = !snapshotsEqual(initial, cur);
    shell.classList.toggle("is-dirty", dirty);

    var editing = shell.classList.contains("is-edit-mode");
    var unsaved = shell.querySelector(".admin-form-shell__unsaved");
    if (unsaved) {
      unsaved.hidden = !editing || !dirty;
    }

    var done = shell.querySelector(".admin-form-shell__btn--done");
    if (done && editing) {
      done.disabled = !dirty;
    } else if (done && !editing) {
      done.disabled = false;
    }
  }

  function initShell(shell) {
    var form = shell.querySelector("form");
    if (!form) return;

    hookDocumentNavigationOnce();

    var initial = collectSnapshot(form);

    function setMode(editing) {
      shell.classList.toggle("is-read-mode", !editing);
      shell.classList.toggle("is-edit-mode", editing);
      setToolbar(shell, editing);
      setControlsEditable(shell, editing);
      refreshDirty(shell, form, initial);
    }

    function onFieldChange() {
      refreshDirty(shell, form, initial);
    }

    setMode(false);

    form.addEventListener("input", onFieldChange);
    form.addEventListener("change", onFieldChange);

    form.addEventListener("submit", function (e) {
      var done = shell.querySelector(".admin-form-shell__btn--done");
      if (shell.classList.contains("is-edit-mode") && done && done.disabled) {
        e.preventDefault();
      }
    });

    shell.querySelector(".admin-form-shell__btn--edit")?.addEventListener("click", function () {
      setMode(true);
    });

    shell.querySelector(".admin-form-shell__btn--cancel")?.addEventListener("click", function () {
      applySnapshot(form, initial);
      setMode(false);
    });

    shell.querySelector(".admin-form-shell__btn--done")?.addEventListener("click", function () {
      if (shell.querySelector(".admin-form-shell__btn--done")?.disabled) return;
      setControlsEditable(shell, true);
      form.requestSubmit();
    });

    window.addEventListener("beforeunload", function (e) {
      if (!shell.classList.contains("is-edit-mode")) return;
      if (!shell.classList.contains("is-dirty")) return;
      e.preventDefault();
      e.returnValue = "";
    });
  }

  document.querySelectorAll("[data-admin-form-edit]").forEach(initShell);
})();

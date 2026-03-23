/**
 * Admin forms: READ → EDIT → Done. Dirty tracking, Done only when changed, leave-confirm when unsaved.
 * Mount: [data-admin-form-edit] with one <form>. Optional: .admin-form-shell__unsaved
 */
(function () {
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

    shell.querySelector(".admin-form-shell__back")?.addEventListener("click", function (e) {
      if (!shell.classList.contains("is-edit-mode")) return;
      if (!shell.classList.contains("is-dirty")) return;
      if (!window.confirm("You have unsaved changes. Leave without saving?")) {
        e.preventDefault();
      }
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

/**
 * Admin forms: default READ mode (static appearance), EDIT → Done saves, Cancel reverts.
 * Mount on a wrapper: [data-admin-form-edit] with one <form> inside.
 * Buttons: .admin-form-shell__btn--edit | --done | --cancel
 * Classes toggled: .is-read-mode / .is-edit-mode
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

  function initShell(shell) {
    var form = shell.querySelector("form");
    if (!form) return;
    var initial = collectSnapshot(form);

    function setMode(editing) {
      shell.classList.toggle("is-read-mode", !editing);
      shell.classList.toggle("is-edit-mode", editing);
      setToolbar(shell, editing);
      setControlsEditable(shell, editing);
    }

    setMode(false);

    shell.querySelector(".admin-form-shell__btn--edit")?.addEventListener("click", function () {
      setMode(true);
    });

    shell.querySelector(".admin-form-shell__btn--cancel")?.addEventListener("click", function () {
      applySnapshot(form, initial);
      setMode(false);
    });

    shell.querySelector(".admin-form-shell__btn--done")?.addEventListener("click", function () {
      setControlsEditable(shell, true);
      form.requestSubmit();
    });
  }

  document.querySelectorAll("[data-admin-form-edit]").forEach(initShell);
})();

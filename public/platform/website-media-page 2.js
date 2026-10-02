/**
 * Shared website media library page upload helper (Wave 4B-1).
 */
(function () {
  "use strict";

  var root = document.querySelector("[data-gp-website-media-page]");
  if (!root) return;

  var dialog = root.querySelector("#gp-we-upload-media");
  var form = root.querySelector("[data-gp-media-upload]");
  var status = root.querySelector("[data-gp-media-upload-status]");

  function openDialog() {
    if (!dialog || typeof dialog.showModal !== "function") return;
    dialog.showModal();
  }

  function closeDialog() {
    if (!dialog || typeof dialog.close !== "function") return;
    dialog.close();
  }

  root.addEventListener("click", function (event) {
    if (event.target.closest("[data-gp-media-upload-open]")) {
      event.preventDefault();
      openDialog();
      return;
    }
    if (event.target.closest("[data-gp-media-upload-close]")) {
      event.preventDefault();
      closeDialog();
    }
  });

  if (!form) return;

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    if (status) status.textContent = "Uploading…";
    var body = new FormData(form);
    fetch(form.action, {
      method: "POST",
      credentials: "same-origin",
      body: body,
      headers: { Accept: "application/json" },
    })
      .then(function (res) {
        return res.json().then(function (payload) {
          return { ok: res.ok, payload: payload };
        });
      })
      .then(function (result) {
        if (!result.ok || !result.payload || !result.payload.ok) {
          throw new Error(
            (result.payload && result.payload.code) || "upload_failed"
          );
        }
        window.location.reload();
      })
      .catch(function (err) {
        if (status) {
          status.textContent =
            "Upload failed. " + String((err && err.message) || "Try again.");
        }
        if (submit) submit.disabled = false;
      });
  });
})();

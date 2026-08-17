(function () {
  var chrome = document.querySelector("[data-website-chrome]");
  if (!chrome) return;
  var clinicKey = chrome.getAttribute("data-clinic-key");
  var csrf = document.querySelector('meta[name="csrf-token"]');
  var csrfField = "_csrf";
  var csrfToken = csrf ? csrf.getAttribute("content") : "";

  function setBusy(el, busy) {
    var saveBtn = el.querySelector("[data-website-save]");
    var cancelBtn = el.querySelector("[data-website-cancel]");
    el.setAttribute("aria-busy", busy ? "true" : "false");
    if (saveBtn) saveBtn.disabled = Boolean(busy);
    if (cancelBtn) cancelBtn.disabled = Boolean(busy);
  }

  function setStatus(el, message, isError) {
    var slot = el.querySelector("[data-website-status-msg]");
    if (!slot) return;
    slot.textContent = message || "";
    slot.classList.toggle("is-error", Boolean(isError));
  }

  function postJson(path, body) {
    var data = {};
    data[csrfField] = csrfToken;
    Object.keys(body || {}).forEach(function (k) {
      data[k] = body[k];
    });
    return fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(data),
    }).then(function (res) {
      return res.json().then(function (out) {
        out = out || {};
        out.httpStatus = res.status;
        return out;
      });
    });
  }

  function uploadImage(file, altText, onProgress) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", "/clinics/" + encodeURIComponent(clinicKey) + "/website/media");
      xhr.withCredentials = true;
      xhr.responseType = "json";
      xhr.upload.onprogress = function (ev) {
        if (onProgress && ev.lengthComputable) {
          onProgress(Math.round((ev.loaded / ev.total) * 100));
        }
      };
      xhr.onload = function () {
        var out = xhr.response || {};
        if (xhr.status >= 200 && xhr.status < 300 && out.ok) resolve(out);
        else reject(out);
      };
      xhr.onerror = function () {
        reject({ ok: false, code: "network_error" });
      };
      var fd = new FormData();
      fd.append(csrfField, csrfToken);
      fd.append("file", file);
      fd.append("altText", altText || "");
      fd.append("mediaKind", "image");
      xhr.send(fd);
    });
  }

  function bindTextField(el) {
    var valueEl = el.querySelector("[data-website-value]");
    var saveBtn = el.querySelector("[data-website-save]");
    var cancelBtn = el.querySelector("[data-website-cancel]");
    if (!valueEl) return;
    var original = valueEl.textContent;

    function exitEdit() {
      el.removeAttribute("data-website-editing");
      valueEl.removeAttribute("contenteditable");
      if (saveBtn) saveBtn.hidden = true;
      if (cancelBtn) cancelBtn.hidden = true;
    }

    function enterEdit() {
      el.setAttribute("data-website-editing", "1");
      valueEl.setAttribute("contenteditable", "true");
      if (saveBtn) saveBtn.hidden = false;
      if (cancelBtn) cancelBtn.hidden = false;
      valueEl.focus();
    }

    function save() {
      setBusy(el, true);
      setStatus(el, "Saving…", false);
      postJson("/clinics/" + encodeURIComponent(clinicKey) + "/website/drafts", {
        contentKey: el.getAttribute("data-website-key"),
        value: valueEl.textContent,
      })
        .then(function (out) {
          setBusy(el, false);
          if (out && out.ok) {
            original = valueEl.textContent;
            exitEdit();
            setStatus(el, "Saved to draft", false);
          } else {
            setStatus(el, (out && (out.reason || out.code)) || "Could not save", true);
          }
        })
        .catch(function () {
          setBusy(el, false);
          setStatus(el, "Could not save", true);
        });
    }

    function cancel() {
      valueEl.textContent = original;
      exitEdit();
      setStatus(el, "", false);
      postJson("/clinics/" + encodeURIComponent(clinicKey) + "/website/drafts/discard", {
        contentKey: el.getAttribute("data-website-key"),
      });
    }

    valueEl.addEventListener("click", function () {
      if (el.getAttribute("data-website-editing") === "1") return;
      enterEdit();
    });
    valueEl.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" && !ev.shiftKey) {
        ev.preventDefault();
        save();
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        cancel();
      } else if (ev.key === "Enter" && el.getAttribute("data-website-editing") !== "1") {
        enterEdit();
      }
    });
    if (saveBtn) saveBtn.addEventListener("click", save);
    if (cancelBtn) cancelBtn.addEventListener("click", cancel);
  }

  function bindImageField(el) {
    var img = el.querySelector("[data-website-image]");
    var fileInput = el.querySelector("[data-website-file]");
    var altInput = el.querySelector("[data-website-alt]");
    var saveBtn = el.querySelector("[data-website-save]");
    var cancelBtn = el.querySelector("[data-website-cancel]");
    var progress = el.querySelector("[data-website-progress]");
    if (!img) return;
    var originalSrc = img.getAttribute("src");
    var originalAlt = altInput ? altInput.value : "";
    var originalMediaId = el.getAttribute("data-website-media-id") || "";
    var pendingFile = null;
    var pendingObjectUrl = null;

    function restore() {
      if (pendingObjectUrl) {
        URL.revokeObjectURL(pendingObjectUrl);
        pendingObjectUrl = null;
      }
      pendingFile = null;
      img.setAttribute("src", originalSrc);
      if (altInput) altInput.value = originalAlt;
      if (fileInput) fileInput.value = "";
      if (progress) {
        progress.hidden = true;
        progress.value = 0;
      }
    }

    if (fileInput) {
      fileInput.addEventListener("change", function () {
        var file = fileInput.files && fileInput.files[0];
        if (!file) return;
        pendingFile = file;
        if (pendingObjectUrl) URL.revokeObjectURL(pendingObjectUrl);
        pendingObjectUrl = URL.createObjectURL(file);
        img.setAttribute("src", pendingObjectUrl);
        setStatus(el, "Preview only — not public until approved", false);
      });
    }

    function save() {
      var altText = altInput ? altInput.value : "";
      setBusy(el, true);
      setStatus(el, pendingFile ? "Uploading…" : "Saving…", false);
      if (progress && pendingFile) progress.hidden = false;
      var chain = pendingFile
        ? uploadImage(pendingFile, altText, function (pct) {
            if (progress) progress.value = pct;
          })
        : Promise.resolve(null);
      chain
        .then(function (uploaded) {
          var value = {
            alt: altText,
            mediaId: uploaded && uploaded.media && uploaded.media.id
              ? uploaded.media.id
              : originalMediaId || null,
            src:
              uploaded && uploaded.media && uploaded.media.id
                ? "/clinics/" + encodeURIComponent(clinicKey) + "/website/media/" + uploaded.media.id
                : img.getAttribute("src"),
          };
          return postJson("/clinics/" + encodeURIComponent(clinicKey) + "/website/drafts", {
            contentKey: el.getAttribute("data-website-key"),
            value: value,
          }).then(function (out) {
            out.uploaded = uploaded;
            return out;
          });
        })
        .then(function (out) {
          setBusy(el, false);
          if (progress) progress.hidden = true;
          if (out && out.ok) {
            if (out.uploaded && out.uploaded.media && out.uploaded.media.id) {
              originalMediaId = out.uploaded.media.id;
              el.setAttribute("data-website-media-id", originalMediaId);
              originalSrc =
                "/clinics/" + encodeURIComponent(clinicKey) + "/website/media/" + originalMediaId;
              img.setAttribute("src", originalSrc);
            }
            originalAlt = altText;
            pendingFile = null;
            if (pendingObjectUrl) {
              URL.revokeObjectURL(pendingObjectUrl);
              pendingObjectUrl = null;
            }
            setStatus(el, "Saved to draft", false);
          } else {
            setStatus(el, (out && (out.reason || out.code)) || "Could not save", true);
          }
        })
        .catch(function (err) {
          setBusy(el, false);
          if (progress) progress.hidden = true;
          setStatus(el, (err && (err.reason || err.code)) || "Could not upload image", true);
        });
    }

    function cancel() {
      restore();
      setStatus(el, "", false);
      postJson("/clinics/" + encodeURIComponent(clinicKey) + "/website/drafts/discard", {
        contentKey: el.getAttribute("data-website-key"),
      });
    }

    if (saveBtn) saveBtn.addEventListener("click", save);
    if (cancelBtn) cancelBtn.addEventListener("click", cancel);
  }

  document.querySelectorAll("[data-website-key]").forEach(function (el) {
    var type = el.getAttribute("data-website-type") || "text";
    if (type === "image") bindImageField(el);
    else bindTextField(el);
  });
})();

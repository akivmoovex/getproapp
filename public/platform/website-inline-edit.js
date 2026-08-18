/**
 * Shared inline website editor (ActiveClinic public/preview).
 * Contract: pencil → input/textarea or image replace → ✓ draft / ✕ cancel.
 * ✓ never publishes. Unknown keys are rejected by the server allowlist.
 */
(function () {
  var chrome = document.querySelector("[data-website-chrome]");
  if (!chrome) return;
  var saveUrl = chrome.getAttribute("data-website-save-url") || "";
  var mediaUrl = chrome.getAttribute("data-website-media-url") || "";
  if (!saveUrl) return;
  function mediaItemUrl(mediaId) {
    if (!mediaUrl || !mediaId) return "";
    return String(mediaUrl).replace(/\/$/, "") + "/" + encodeURIComponent(mediaId);
  }
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
      xhr.open("POST", mediaUrl);
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
    var display = el.querySelector("[data-website-display]");
    var editor = el.querySelector("[data-website-editor]");
    var valueEl = el.querySelector("[data-website-value-text]");
    var input = el.querySelector("[data-website-input]");
    var saveBtn = el.querySelector("[data-website-save]");
    var cancelBtn = el.querySelector("[data-website-cancel]");
    var startBtn = el.querySelector("[data-website-start]");
    if (!input) return;
    var original = el.getAttribute("data-website-value");
    if (original == null) original = input.value;

    function exitEdit() {
      el.removeAttribute("data-website-editing");
      if (editor) editor.hidden = true;
      if (display) display.hidden = false;
    }

    function enterEdit() {
      el.setAttribute("data-website-editing", "1");
      if (display) display.hidden = true;
      if (editor) editor.hidden = false;
      input.value = original;
      input.focus();
      if (typeof input.select === "function" && el.getAttribute("data-website-type") !== "textarea") {
        input.select();
      }
      try {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      } catch (err) {
        /* ignore */
      }
    }

    function save() {
      setBusy(el, true);
      setStatus(el, "Saving…", false);
      postJson(saveUrl, {
        contentKey: el.getAttribute("data-website-key"),
        value: input.value,
      })
        .then(function (out) {
          setBusy(el, false);
          if (out && out.ok && out.published === true) {
            setStatus(el, "Save must not publish. Draft was not applied as live.", true);
            return;
          }
          if (out && out.ok) {
            original = input.value;
            el.setAttribute("data-website-value", original);
            if (valueEl) valueEl.textContent = original;
            var currentEl = el.querySelector("[data-website-current]");
            if (currentEl) currentEl.textContent = original;
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
      input.value = original;
      if (valueEl) valueEl.textContent = original;
      exitEdit();
      setStatus(el, "", false);
    }

    if (startBtn) {
      startBtn.addEventListener("click", function () {
        if (el.getAttribute("data-website-editing") === "1") return;
        enterEdit();
      });
    }
    input.addEventListener("keydown", function (ev) {
      if (el.getAttribute("data-website-editing") !== "1") return;
      if (ev.key === "Enter" && el.getAttribute("data-website-type") !== "textarea" && !ev.shiftKey) {
        ev.preventDefault();
        save();
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        cancel();
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
    var startBtn = el.querySelector("[data-website-start]");
    var tools = el.querySelector("[data-website-image-tools]");
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

    function exitEdit() {
      el.removeAttribute("data-website-editing");
      if (tools) tools.hidden = true;
      if (startBtn) startBtn.hidden = false;
    }

    function enterEdit() {
      el.setAttribute("data-website-editing", "1");
      if (tools) tools.hidden = false;
      if (saveBtn) saveBtn.hidden = false;
      if (cancelBtn) cancelBtn.hidden = false;
      if (startBtn) startBtn.hidden = true;
      if (altInput) altInput.focus();
      try {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      } catch (err) {
        /* ignore */
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
        setStatus(el, "Preview only — not public until you save to draft and publish", false);
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
                ? mediaItemUrl(uploaded.media.id)
                : img.getAttribute("src"),
          };
          return postJson(saveUrl, {
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
          if (out && out.ok && out.published === true) {
            setStatus(el, "Save must not publish. Draft was not applied as live.", true);
            return;
          }
          if (out && out.ok) {
            if (out.uploaded && out.uploaded.media && out.uploaded.media.id) {
              originalMediaId = out.uploaded.media.id;
              el.setAttribute("data-website-media-id", originalMediaId);
              originalSrc = mediaItemUrl(originalMediaId);
              img.setAttribute("src", originalSrc);
            }
            originalAlt = altText;
            pendingFile = null;
            if (pendingObjectUrl) {
              URL.revokeObjectURL(pendingObjectUrl);
              pendingObjectUrl = null;
            }
            exitEdit();
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
      exitEdit();
      setStatus(el, "", false);
    }

    if (startBtn) startBtn.addEventListener("click", enterEdit);
    if (saveBtn) saveBtn.addEventListener("click", save);
    if (cancelBtn) cancelBtn.addEventListener("click", cancel);
  }

  document.querySelectorAll("[data-website-key]").forEach(function (el) {
    var type = el.getAttribute("data-website-type") || "text";
    if (type === "image") bindImageField(el);
    else bindTextField(el);
  });
})();

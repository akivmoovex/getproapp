/**
 * Shared platform website media field + Content Library picker.
 * Used by ActiveClinic CMS forms and available to BlessBoard surfaces.
 * Uploads go to the existing product media endpoint (data-gp-we-media-url).
 */
(function () {
  "use strict";

  var MAX_BYTES = 5 * 1024 * 1024;
  var ALLOWED = {
    "image/jpeg": true,
    "image/png": true,
    "image/webp": true,
    "image/gif": true,
  };

  function csrfToken() {
    var meta = document.querySelector('meta[name="csrf-token"]');
    if (meta && meta.getAttribute("content")) return meta.getAttribute("content");
    var input = document.querySelector('input[name="_csrf"]');
    return input ? input.value : "";
  }

  function validateFile(file) {
    if (!file) return { ok: false, reason: "Choose an image" };
    var type = String(file.type || "").toLowerCase();
    if (!ALLOWED[type]) return { ok: false, reason: "Use JPEG, PNG, WebP, or GIF" };
    if (file.size > MAX_BYTES) return { ok: false, reason: "Image must be 5 MB or smaller" };
    return { ok: true };
  }

  function setStatus(el, text, isError) {
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("is-error", Boolean(isError && text));
  }

  function applySelection(field, item) {
    if (!field || !item) return;
    var idInput = field.querySelector("[data-gp-we-media-id]");
    var srcInput = field.querySelector("[data-gp-we-media-src]");
    var altInput = field.querySelector("[data-gp-we-media-alt]");
    var preview = field.querySelector("[data-gp-we-media-preview]");
    var empty = field.querySelector("[data-gp-we-media-preview-empty]");
    var removeBtn = field.querySelector("[data-gp-we-media-remove]");
    var uploadLabel = field.querySelector("[data-gp-we-media-upload-label]");
    var src = item.previewUrl || item.publicSrc || item.src || "";
    if (idInput) idInput.value = item.id || item.mediaId || "";
    if (srcInput) {
      srcInput.value = src;
      srcInput.dispatchEvent(new Event("input", { bubbles: true }));
    }
    if (altInput && !altInput.value && (item.altText || item.alt)) {
      altInput.value = item.altText || item.alt;
    }
    if (preview) {
      if (src) {
        preview.src = src;
        preview.hidden = false;
      } else {
        preview.removeAttribute("src");
        preview.hidden = true;
      }
    }
    if (empty) empty.hidden = Boolean(src);
    if (removeBtn) removeBtn.hidden = !src;
    if (uploadLabel) uploadLabel.textContent = src ? "Replace image" : "Upload from computer";
  }

  function clearSelection(field) {
    applySelection(field, { id: "", src: "", altText: "" });
    var altInput = field.querySelector("[data-gp-we-media-alt]");
    if (altInput) altInput.value = "";
  }

  function uploadFile(url, file, altText, onProgress) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", url);
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
      fd.append("_csrf", csrfToken());
      fd.append("file", file);
      fd.append("altText", altText || "");
      fd.append("mediaKind", "image");
      xhr.send(fd);
    });
  }

  function mediaFromUpload(out) {
    var media = (out && out.media) || out || {};
    return {
      id: media.id || media.mediaId || "",
      previewUrl: media.publicSrc || media.previewUrl || media.src || "",
      altText: media.altText || media.alt || "",
    };
  }

  function loadLibrary(url, grid, onPick) {
    if (!url || !grid) return;
    grid.textContent = "Loading…";
    fetch(url, {
      credentials: "same-origin",
      headers: { Accept: "application/json", "X-CSRF-Token": csrfToken() },
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (json) {
        var items = (json && json.media) || [];
        grid.textContent = "";
        if (!items.length) {
          var empty = document.createElement("p");
          empty.className = "gp-we-media-picker__empty";
          empty.textContent = "No images yet. Upload from your computer above.";
          grid.appendChild(empty);
          return;
        }
        items.forEach(function (item) {
          var button = document.createElement("button");
          button.type = "button";
          button.className = "gp-we-media-picker__card";
          var src = item.previewUrl || item.publicSrc || "";
          if (src) {
            var thumb = document.createElement("img");
            thumb.src = src;
            thumb.alt = "";
            thumb.loading = "lazy";
            button.appendChild(thumb);
          }
          var label = document.createElement("span");
          label.textContent = item.title || item.originalFilename || "Image";
          button.appendChild(label);
          button.addEventListener("click", function () {
            onPick(item);
          });
          grid.appendChild(button);
        });
      })
      .catch(function () {
        grid.textContent = "Unable to load the Content Library.";
      });
  }

  var picker = document.querySelector("[data-gp-we-media-picker]");
  var pickerTarget = null;

  function openPicker(field) {
    pickerTarget = field;
    if (!picker || typeof picker.showModal !== "function") return;
    var url =
      field.getAttribute("data-gp-we-media-url") ||
      picker.getAttribute("data-gp-we-media-url") ||
      "";
    picker.setAttribute("data-gp-we-media-url", url);
    picker.showModal();
    var grid = picker.querySelector("[data-gp-we-picker-grid]");
    var status = picker.querySelector("[data-gp-we-picker-status]");
    var progress = picker.querySelector("[data-gp-we-picker-progress]");
    setStatus(status, "", false);
    if (progress) {
      progress.hidden = true;
      progress.value = 0;
    }
    loadLibrary(url, grid, function (item) {
      applySelection(pickerTarget, item);
      picker.close();
    });
  }

  document.querySelectorAll("[data-gp-we-media-field]").forEach(function (field) {
    var fileInput = field.querySelector("[data-gp-we-media-file]");
    var status = field.querySelector("[data-gp-we-media-status]");
    var openLibrary = field.querySelector("[data-gp-we-media-open-library]");
    var removeBtn = field.querySelector("[data-gp-we-media-remove]");
    var mediaUrl = field.getAttribute("data-gp-we-media-url") || "";

    if (fileInput) {
      fileInput.addEventListener("change", function () {
        var file = fileInput.files && fileInput.files[0];
        fileInput.value = "";
        var check = validateFile(file);
        if (!check.ok) {
          setStatus(status, check.reason, true);
          return;
        }
        if (!mediaUrl) {
          setStatus(status, "Media upload is unavailable on this page.", true);
          return;
        }
        var altInput = field.querySelector("[data-gp-we-media-alt]");
        setStatus(status, "Uploading…", false);
        uploadFile(mediaUrl, file, altInput ? altInput.value : "", function () {})
          .then(function (out) {
            applySelection(field, mediaFromUpload(out));
            setStatus(status, "Image uploaded. Save to keep this change in draft.", false);
          })
          .catch(function (err) {
            setStatus(
              status,
              (err && (err.reason || err.code)) || "Upload failed. Try again.",
              true
            );
          });
      });
    }

    if (openLibrary) {
      openLibrary.addEventListener("click", function () {
        openPicker(field);
      });
    }

    if (removeBtn) {
      removeBtn.addEventListener("click", function () {
        clearSelection(field);
        setStatus(status, "Image removed. Save to keep this change in draft.", false);
      });
    }
  });

  // Legacy ActiveClinic / BlessBoard hooks → shared field behavior
  document.querySelectorAll("[data-ac-mw-media-field], [data-bb-wb-media-field]").forEach(function (field) {
    if (field.getAttribute("data-gp-we-media-field")) return;
    field.setAttribute("data-gp-we-media-field", "1");
    var legacyOpen =
      field.querySelector("[data-ac-mw-open-media]") ||
      field.querySelector("[data-bb-wb-open-media]");
    if (legacyOpen && !field.querySelector("[data-gp-we-media-open-library]")) {
      legacyOpen.setAttribute("data-gp-we-media-open-library", "1");
    }
  });

  if (picker) {
    var closeBtn = picker.querySelector("[data-gp-we-picker-close]");
    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        picker.close();
      });
    }
    var uploadInput = picker.querySelector("[data-gp-we-picker-upload]");
    if (uploadInput) {
      uploadInput.addEventListener("change", function () {
        var file = uploadInput.files && uploadInput.files[0];
        uploadInput.value = "";
        var check = validateFile(file);
        var status = picker.querySelector("[data-gp-we-picker-status]");
        var progress = picker.querySelector("[data-gp-we-picker-progress]");
        var url = picker.getAttribute("data-gp-we-media-url") || "";
        if (!check.ok) {
          setStatus(status, check.reason, true);
          return;
        }
        if (!url) {
          setStatus(status, "Media upload is unavailable.", true);
          return;
        }
        setStatus(status, "Uploading…", false);
        if (progress) {
          progress.hidden = false;
          progress.value = 0;
        }
        uploadFile(url, file, "", function (pct) {
          if (progress) progress.value = pct;
        })
          .then(function (out) {
            if (progress) progress.hidden = true;
            var item = mediaFromUpload(out);
            if (pickerTarget) applySelection(pickerTarget, item);
            setStatus(status, "Uploaded. Selected for this field.", false);
            var grid = picker.querySelector("[data-gp-we-picker-grid]");
            loadLibrary(url, grid, function (picked) {
              applySelection(pickerTarget, picked);
              picker.close();
            });
            if (item.id || item.previewUrl) {
              applySelection(pickerTarget, item);
              picker.close();
            }
          })
          .catch(function (err) {
            if (progress) progress.hidden = true;
            setStatus(
              status,
              (err && (err.reason || err.code)) || "Upload failed. Try again.",
              true
            );
          });
      });
    }
  }

  // Keep AC dialog attribute working as alias
  var legacyPicker = document.querySelector("[data-ac-mw-media-picker]");
  if (legacyPicker && !picker) {
    legacyPicker.setAttribute("data-gp-we-media-picker", "1");
  }
})();

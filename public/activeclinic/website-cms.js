(function () {
  "use strict";

  function csrfToken() {
    var meta = document.querySelector('meta[name="csrf-token"]');
    if (meta && meta.content) return meta.content;
    var field = document.querySelector('input[name="_csrf"]');
    return field ? field.value : "";
  }

  document.querySelectorAll("[data-ac-mw-reorder]").forEach(function (form) {
    var list = form.querySelector("[data-ac-mw-list]");
    if (!list) return;
    list.querySelectorAll("[data-ac-mw-move]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var row = btn.closest("[data-ac-mw-item]");
        if (!row) return;
        if (btn.getAttribute("data-ac-mw-move") === "up" && row.previousElementSibling) {
          list.insertBefore(row, row.previousElementSibling);
        }
        if (btn.getAttribute("data-ac-mw-move") === "down" && row.nextElementSibling) {
          list.insertBefore(row.nextElementSibling, row);
        }
        list.querySelectorAll('input[data-ac-mw-order]').forEach(function (input, index) {
          input.value = String(index);
        });
      });
    });
  });

  var upload = document.querySelector("[data-ac-mw-upload]");
  if (upload) {
    var status = document.querySelector("[data-ac-mw-upload-status]");
    var maxBytes = 5 * 1024 * 1024;
    var allowed = {
      "image/jpeg": true,
      "image/png": true,
      "image/webp": true,
      "image/gif": true,
    };
    upload.addEventListener("submit", function (event) {
      if (!upload.getAttribute("data-ac-mw-ajax")) return;
      event.preventDefault();
      var fileInput = upload.querySelector('input[type="file"]');
      var file = fileInput && fileInput.files && fileInput.files[0];
      if (!file) {
        if (status) status.textContent = "Choose an image to upload.";
        return;
      }
      var type = String(file.type || "").toLowerCase();
      if (!allowed[type]) {
        if (status) status.textContent = "Upload failed. Use JPEG, PNG, WebP, or GIF up to 5 MB.";
        return;
      }
      if (file.size > maxBytes) {
        if (status) status.textContent = "Upload failed. Image must be 5 MB or smaller.";
        return;
      }
      var body = new FormData(upload);
      if (status) status.textContent = "Uploading…";
      fetch(upload.action, {
        method: "POST",
        body: body,
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      })
        .then(function (res) {
          return res.text().then(function (text) {
            var json = null;
            try {
              json = text ? JSON.parse(text) : null;
            } catch (err) {
              json = null;
            }
            return { res: res, json: json };
          });
        })
        .then(function (result) {
          if (!result.json || !result.json.ok) {
            var code = result.json && result.json.code;
            if (status) {
              status.textContent =
                code === "media_too_large"
                  ? "Upload failed. Image must be 5 MB or smaller."
                  : "Upload failed. Use JPEG, PNG, WebP, or GIF up to 5 MB.";
            }
            return;
          }
          window.location.reload();
        })
        .catch(function () {
          if (status) status.textContent = "Upload failed. Check your connection and try again.";
        });
    });
  }

  var publishForm = document.getElementById("ac-mw-publish-form");
  if (publishForm) {
    var publishStatus = document.querySelector("[data-ac-mw-publish-status]");
    publishForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!window.confirm("Publish this website? Public visitors will see the current draft.")) {
        return;
      }
      var btn = publishForm.querySelector('[type="submit"]');
      if (btn) btn.disabled = true;
      if (publishStatus) {
        publishStatus.hidden = false;
        publishStatus.textContent = "Publishing…";
        publishStatus.classList.remove("ac-mw-error");
      }
      // URL-encoded body so express.urlencoded populates req.body for CSRF.
      // multipart FormData leaves req.body empty and publish returns 403 csrf.
      var body = new URLSearchParams(new FormData(publishForm));
      fetch(publishForm.action, {
        method: "POST",
        body: body,
        credentials: "same-origin",
        headers: {
          Accept: "application/json, text/html",
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "X-CSRF-Token": csrfToken(),
        },
        redirect: "follow",
      })
        .then(function (res) {
          if (res.ok || (res.status >= 300 && res.status < 400)) {
            if (publishStatus) publishStatus.textContent = "Published.";
            window.location.reload();
            return;
          }
          if (btn) btn.disabled = false;
          if (publishStatus) {
            publishStatus.textContent = "Publish failed — draft unchanged. Retry.";
            publishStatus.classList.add("ac-mw-error");
          }
        })
        .catch(function () {
          if (btn) btn.disabled = false;
          if (publishStatus) {
            publishStatus.textContent =
              "Publish failed — check your connection and retry. Draft unchanged.";
            publishStatus.classList.add("ac-mw-error");
          }
        });
    });
  }

  document.querySelectorAll("[data-ac-mw-open]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var id = btn.getAttribute("data-ac-mw-open");
      var dialog = id ? document.getElementById(id) : null;
      if (dialog && typeof dialog.showModal === "function") dialog.showModal();
    });
  });
  document.querySelectorAll("[data-ac-mw-close]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var dialog = btn.closest("dialog");
      if (dialog) dialog.close();
    });
  });

  var picker = document.querySelector("[data-ac-mw-media-picker]");
  var pickerTarget = null;
  document.querySelectorAll("[data-ac-mw-open-media]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      pickerTarget = btn.closest("[data-ac-mw-media-field]") || btn.closest("form");
      if (!picker || typeof picker.showModal !== "function") return;
      var url = picker.getAttribute("data-ac-mw-media-url");
      var grid = picker.querySelector("[data-ac-mw-picker-grid]");
      picker.showModal();
      if (!url || !grid) return;
      grid.textContent = "Loading…";
      fetch(url, { credentials: "same-origin", headers: { Accept: "application/json" } })
        .then(function (res) { return res.json(); })
        .then(function (json) {
          var items = (json && json.media) || [];
          if (!items.length) {
            grid.innerHTML = "<p class=\"ac-mw-muted\">No media yet. Upload an image in the media library first.</p>";
            return;
          }
          grid.innerHTML = "";
          items.forEach(function (item) {
            var button = document.createElement("button");
            button.type = "button";
            button.className = "ac-mw-media-card";
            // Built as DOM nodes, never markup, so filenames and alt text can
            // never be interpreted as HTML.
            var src = item.previewUrl || item.publicSrc;
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
            if (item.altText) {
              var altHint = document.createElement("span");
              altHint.className = "ac-mw-muted";
              altHint.textContent = item.altText;
              button.appendChild(altHint);
            }
            button.addEventListener("click", function () {
              if (!pickerTarget) return;
              var idInput = pickerTarget.querySelector("[data-ac-mw-media-id]");
              var srcInput = pickerTarget.querySelector("[data-ac-mw-media-src]");
              var altInput = pickerTarget.querySelector("[data-ac-mw-media-alt]");
              var preview = pickerTarget.querySelector("[data-ac-mw-media-preview]");
              var empty = pickerTarget.querySelector("[data-ac-mw-media-preview-empty]");
              if (idInput) idInput.value = item.id || "";
              if (srcInput) {
                srcInput.value = src || "";
                srcInput.dispatchEvent(new Event("input", { bubbles: true }));
              }
              if (altInput && !altInput.value) altInput.value = item.altText || "";
              if (preview && src) {
                preview.src = src;
                preview.hidden = false;
              }
              if (empty) empty.hidden = Boolean(src);
              picker.close();
            });
            grid.appendChild(button);
          });
        })
        .catch(function () {
          grid.textContent = "Unable to load media for this clinic.";
        });
    });
  });

  document.querySelectorAll("[data-ac-mw-color]").forEach(function (root) {
    var swatch = root.querySelector("[data-ac-mw-color-swatch]");
    var text = root.querySelector("[data-ac-mw-color-text]");
    if (!swatch || !text) return;
    swatch.addEventListener("input", function () {
      text.value = swatch.value;
      text.dispatchEvent(new Event("input", { bubbles: true }));
    });
    text.addEventListener("input", function () {
      if (/^#[0-9A-Fa-f]{6}$/.test(text.value.trim())) swatch.value = text.value.trim();
    });
  });

  var brandForm = document.querySelector("[data-ac-mw-brand-form]");
  var brandPreview = document.querySelector("[data-ac-mw-brand-preview]");
  function syncBrandPreview() {
    if (!brandForm || !brandPreview) return;
    var primaryInput = brandForm.querySelector('[name="primaryColor"]');
    var accentInput = brandForm.querySelector('[name="accentColor"]');
    var primary = primaryInput && /^#[0-9A-Fa-f]{6}$/.test(primaryInput.value.trim())
      ? primaryInput.value.trim()
      : "#006068";
    var accent = accentInput && /^#[0-9A-Fa-f]{6}$/.test(accentInput.value.trim())
      ? accentInput.value.trim()
      : "#0f766e";
    brandPreview.style.setProperty("--preview-primary", primary);
    brandPreview.style.setProperty("--preview-accent", accent);
    var nameEl = brandPreview.querySelector("[data-ac-mw-preview-name]");
    if (nameEl) nameEl.textContent = brandPreview.getAttribute("data-preview-name") || "Your clinic";
    var fields = brandForm.querySelectorAll("[data-ac-mw-media-field]");
    var logoField = fields[0];
    var heroField = fields[1];
    var logoSrc = logoField && logoField.querySelector("[data-ac-mw-media-src]");
    var heroSrc = heroField && heroField.querySelector("[data-ac-mw-media-src]");
    var logoImg = brandPreview.querySelector("[data-ac-mw-preview-logo]");
    var heroImg = brandPreview.querySelector("[data-ac-mw-preview-hero]");
    if (logoImg) {
      logoImg.src = (logoSrc && logoSrc.value) || "";
      logoImg.hidden = !(logoSrc && logoSrc.value);
    }
    if (heroImg) {
      heroImg.src = (heroSrc && heroSrc.value) || "";
      heroImg.hidden = !(heroSrc && heroSrc.value);
    }
  }
  if (brandForm) {
    brandForm.addEventListener("input", syncBrandPreview);
    syncBrandPreview();
  }

  var seoForm = document.querySelector("[data-ac-mw-seo-form]");
  var seoPreview = document.querySelector("[data-ac-mw-seo-preview]");
  function syncSeoPreview() {
    if (!seoForm || !seoPreview) return;
    var title = seoForm.querySelector('[name="seoTitle"]');
    var desc = seoForm.querySelector('[name="seoDescription"]');
    var titleEl = seoPreview.querySelector("[data-ac-mw-preview-title]");
    var descEl = seoPreview.querySelector("[data-ac-mw-preview-desc]");
    var urlEl = seoPreview.querySelector("[data-ac-mw-preview-url]");
    if (titleEl) titleEl.textContent = (title && title.value.trim()) || "Clinic website";
    if (descEl) descEl.textContent = (desc && desc.value.trim()) || "A short description of your clinic.";
    if (urlEl) urlEl.textContent = seoPreview.getAttribute("data-preview-url") || "";
    var src = seoForm.querySelector("[data-ac-mw-media-src]");
    var share = seoPreview.querySelector("[data-ac-mw-preview-share]");
    if (share) {
      share.src = (src && src.value) || "";
      share.hidden = !(src && src.value);
    }
  }
  if (seoForm) {
    seoForm.addEventListener("input", syncSeoPreview);
    syncSeoPreview();
  }

  document.querySelectorAll("[data-ac-mw-library-form]").forEach(function (form) {
    var select = form.querySelector("[data-ac-mw-library-type]");
    function syncLibraryFields() {
      var type = select ? select.value : "";
      form.querySelectorAll("[data-ac-mw-library-fields]").forEach(function (group) {
        var allowed = (group.getAttribute("data-ac-mw-library-fields") || "").split(",");
        var on = allowed.indexOf(type) !== -1;
        group.hidden = !on;
      });
    }
    if (select) {
      select.addEventListener("change", syncLibraryFields);
      syncLibraryFields();
    }
  });
})();

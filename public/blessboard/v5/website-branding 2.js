(function () {
  "use strict";

  function csrfToken() {
    var meta = document.querySelector('meta[name="csrf-token"]');
    if (meta && meta.content) return meta.content;
    var field = document.querySelector('input[name="_csrf"]');
    return field ? field.value : "";
  }

  document.querySelectorAll("[data-bb-wb-open]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var id = btn.getAttribute("data-bb-wb-open");
      var dialog = id ? document.getElementById(id) : null;
      if (dialog && typeof dialog.showModal === "function") dialog.showModal();
    });
  });
  document.querySelectorAll("[data-bb-wb-close]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var dialog = btn.closest("dialog");
      if (dialog) dialog.close();
    });
  });

  var picker = document.querySelector("[data-bb-wb-media-picker]");
  var pickerTarget = null;
  document.querySelectorAll("[data-bb-wb-open-media]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      pickerTarget = btn.closest("[data-bb-wb-media-field]") || btn.closest("form");
      if (!picker || typeof picker.showModal !== "function") return;
      var url = picker.getAttribute("data-bb-wb-media-url");
      var grid = picker.querySelector("[data-bb-wb-picker-grid]");
      picker.showModal();
      if (!url || !grid) return;
      grid.textContent = "Loading…";
      fetch(url, { credentials: "same-origin", headers: { Accept: "application/json" } })
        .then(function (res) {
          return res.json();
        })
        .then(function (json) {
          var items = (json && json.media) || [];
          if (!items.length) {
            grid.innerHTML =
              '<p class="bb-wb-muted">No media yet. Upload an image in the content library first.</p>';
            return;
          }
          grid.innerHTML = "";
          items.forEach(function (item) {
            var button = document.createElement("button");
            button.type = "button";
            button.className = "bb-wb-media-card";
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
            button.addEventListener("click", function () {
              if (!pickerTarget) return;
              var idInput = pickerTarget.querySelector("[data-bb-wb-media-id]");
              var srcInput = pickerTarget.querySelector("[data-bb-wb-media-src]");
              var altInput = pickerTarget.querySelector("[data-bb-wb-media-alt]");
              var preview = pickerTarget.querySelector("[data-bb-wb-media-preview]");
              var empty = pickerTarget.querySelector("[data-bb-wb-media-preview-empty]");
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
          grid.textContent = "Unable to load media for this church.";
        });
    });
  });

  document.querySelectorAll("[data-bb-wb-upload]").forEach(function (input) {
    input.addEventListener("change", function () {
      var field = input.closest("[data-bb-wb-media-field]");
      if (!field || !input.files || !input.files[0]) return;
      var mediaUrl = picker && picker.getAttribute("data-bb-wb-media-url");
      if (!mediaUrl) return;
      var body = new FormData();
      body.append("file", input.files[0]);
      body.append("_csrf", csrfToken());
      var altInput = field.querySelector("[data-bb-wb-media-alt]");
      if (altInput && altInput.value) body.append("altText", altInput.value);
      fetch(mediaUrl, {
        method: "POST",
        body: body,
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      })
        .then(function (res) {
          return res.json().then(function (json) {
            return { res: res, json: json };
          });
        })
        .then(function (result) {
          if (!result.json || !result.json.ok || !result.json.media) return;
          var media = result.json.media;
          var idInput = field.querySelector("[data-bb-wb-media-id]");
          var srcInput = field.querySelector("[data-bb-wb-media-src]");
          var preview = field.querySelector("[data-bb-wb-media-preview]");
          var empty = field.querySelector("[data-bb-wb-media-preview-empty]");
          var src = media.publicSrc || media.previewUrl || "";
          if (idInput) idInput.value = media.id || "";
          if (srcInput) {
            srcInput.value = src;
            srcInput.dispatchEvent(new Event("input", { bubbles: true }));
          }
          if (preview && src) {
            preview.src = src;
            preview.hidden = false;
          }
          if (empty) empty.hidden = Boolean(src);
        })
        .catch(function () {
          /* upload failure is non-fatal; user can retry */
        })
        .finally(function () {
          input.value = "";
        });
    });
  });

  document.querySelectorAll("[data-bb-wb-color]").forEach(function (root) {
    var swatch = root.querySelector("[data-bb-wb-color-swatch]");
    var text = root.querySelector("[data-bb-wb-color-text]");
    if (!swatch || !text) return;
    swatch.addEventListener("input", function () {
      text.value = swatch.value;
      text.dispatchEvent(new Event("input", { bubbles: true }));
    });
    text.addEventListener("input", function () {
      if (/^#[0-9A-Fa-f]{6}$/.test(text.value.trim())) swatch.value = text.value.trim();
    });
  });

  var brandForm = document.querySelector("[data-bb-wb-brand-form]");
  var brandPreview = document.querySelector("[data-bb-wb-brand-preview]");
  function syncBrandPreview() {
    if (!brandForm || !brandPreview) return;
    var primaryInput = brandForm.querySelector('[name="primaryColor"]');
    var accentInput = brandForm.querySelector('[name="accentColor"]');
    var defaultPrimary = brandPreview.getAttribute("data-preview-primary") || "#6c5ce7";
    var defaultAccent = brandPreview.getAttribute("data-preview-accent") || "#5341cd";
    var primary =
      primaryInput && /^#[0-9A-Fa-f]{6}$/.test(primaryInput.value.trim())
        ? primaryInput.value.trim()
        : defaultPrimary;
    var accent =
      accentInput && /^#[0-9A-Fa-f]{6}$/.test(accentInput.value.trim())
        ? accentInput.value.trim()
        : defaultAccent;
    brandPreview.style.setProperty("--preview-primary", primary);
    brandPreview.style.setProperty("--preview-accent", accent);
    var nameEl = brandPreview.querySelector("[data-bb-wb-preview-name]");
    if (nameEl) nameEl.textContent = brandPreview.getAttribute("data-preview-name") || "Your church";
    var fields = brandForm.querySelectorAll("[data-bb-wb-media-field]");
    var logoField = fields[0];
    var heroField = fields[1];
    var logoSrc = logoField && logoField.querySelector("[data-bb-wb-media-src]");
    var heroSrc = heroField && heroField.querySelector("[data-bb-wb-media-src]");
    var logoImg = brandPreview.querySelector("[data-bb-wb-preview-logo]");
    var heroImg = brandPreview.querySelector("[data-bb-wb-preview-hero]");
    if (logoImg) {
      logoImg.src = (logoSrc && logoSrc.value) || "";
      logoImg.hidden = !(logoSrc && logoSrc.value);
    }
    if (heroImg) {
      heroImg.src = (heroSrc && heroSrc.value) || "";
      heroImg.hidden = !(heroSrc && heroSrc.value);
    }
    var cta = brandPreview.querySelector("[data-bb-wb-preview-cta]");
    if (cta) cta.style.background = primary;
  }
  if (brandForm) {
    brandForm.addEventListener("input", syncBrandPreview);
    syncBrandPreview();
  }
})();

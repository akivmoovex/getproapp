/**
 * Shared website field editor (ActiveClinic + BlessBoard) — Wave 2.
 * Pencil → Stitch dialog (desktop) / bottom sheet (mobile) → Save draft (never publish).
 */
(function () {
  function bindEditorShell() {
    document.querySelectorAll("[data-website-engine-page-select]").forEach(function (sel) {
      sel.addEventListener("change", function () {
        var opt = sel.options[sel.selectedIndex];
        var href = opt && opt.getAttribute("data-href");
        if (href) window.location.assign(href);
      });
    });
    document.querySelectorAll("[data-website-viewport]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var mode = btn.getAttribute("data-website-viewport");
        document.body.classList.toggle("gp-website-viewport-mobile", mode === "mobile");
        document.querySelectorAll("[data-website-viewport]").forEach(function (other) {
          other.classList.toggle("is-current", other === btn);
        });
      });
    });
    bindMoreMenu();
    bindPageSheet();
  }

  function bindMoreMenu() {
    document.querySelectorAll("[data-website-more]").forEach(function (wrap) {
      var toggle = wrap.querySelector("[data-website-more-toggle]");
      var menu = wrap.querySelector("[data-website-more-menu]");
      if (!toggle || !menu) return;
      function setOpen(open) {
        menu.hidden = !open;
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
      }
      toggle.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        setOpen(menu.hidden);
      });
      document.addEventListener("click", function (ev) {
        if (!wrap.contains(ev.target)) setOpen(false);
      });
      document.addEventListener("keydown", function (ev) {
        if (ev.key === "Escape") setOpen(false);
      });
    });
    document.querySelectorAll("[data-website-more-action]").forEach(function (btn) {
      btn.addEventListener("click", function (ev) {
        var action = btn.getAttribute("data-website-more-action");
        if (action === "features") {
          ev.preventDefault();
          var features = document.querySelector("[data-bb-features-toggle]");
          if (features) features.click();
        }
        if (action === "pages") {
          ev.preventDefault();
          openPageSheet();
        }
      });
    });
  }

  function pageSheetEls() {
    return {
      overlay: document.querySelector("[data-website-page-sheet-overlay]"),
      sheet: document.querySelector("[data-website-page-sheet]"),
    };
  }

  function setPageSheetOpen(open) {
    var els = pageSheetEls();
    if (!els.sheet) return;
    els.sheet.hidden = !open;
    if (els.overlay) els.overlay.hidden = !open;
  }

  function openPageSheet() {
    setPageSheetOpen(true);
  }

  function bindPageSheet() {
    var els = pageSheetEls();
    if (!els.sheet) return;
    document.querySelectorAll("[data-website-page-sheet-close]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setPageSheetOpen(false);
      });
    });
    if (els.overlay) {
      els.overlay.addEventListener("click", function () {
        setPageSheetOpen(false);
      });
    }
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") setPageSheetOpen(false);
    });
  }

  bindEditorShell();

  var chrome = document.querySelector("[data-website-chrome]");
  if (!chrome) return;
  var saveUrl = chrome.getAttribute("data-website-save-url") || "";
  var mediaUrl = chrome.getAttribute("data-website-media-url") || "";
  var maxImageBytes = Number(chrome.getAttribute("data-website-max-bytes")) || 5 * 1024 * 1024;
  var allowedImageTypes = {
    "image/jpeg": true,
    "image/png": true,
    "image/webp": true,
    "image/gif": true,
  };
  if (!saveUrl) return;

  var csrf = document.querySelector('meta[name="csrf-token"]');
  var csrfField = "_csrf";
  var csrfToken = csrf ? csrf.getAttribute("content") : "";

  function mediaItemUrl(mediaId) {
    if (!mediaUrl || !mediaId) return "";
    return String(mediaUrl).replace(/\/$/, "") + "/" + encodeURIComponent(mediaId);
  }

  function markDraftSaved() {
    var slot = document.querySelector("[data-website-engine-save-state]");
    if (slot) slot.textContent = "Saved to draft";
    if (chrome) chrome.setAttribute("data-draft", "1");
    var draft = document.querySelector("[data-website-engine-draft]");
    var short = document.querySelector("[data-website-engine-draft-short]");
    function bump(el, longForm) {
      if (!el || !el.textContent) return;
      var match = el.textContent.match(/Draft\s*•\s*(\d+)/);
      if (match) {
        var next = Number(match[1]) + 1;
        el.textContent = longForm
          ? "Draft • " + next + " unpublished changes"
          : "Draft • " + next + " changes";
        return;
      }
      if (/No unpublished/i.test(el.textContent)) {
        el.textContent = longForm ? "Draft • 1 unpublished changes" : "Draft • 1 changes";
      }
    }
    bump(draft, true);
    bump(short, false);
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
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-CSRF-Token": csrfToken,
      },
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

  function validateImageFile(file) {
    if (!file) return { ok: false, reason: "Choose an image" };
    var type = String(file.type || "").toLowerCase();
    if (!allowedImageTypes[type]) {
      return { ok: false, reason: "Use JPEG, PNG, WebP, or GIF" };
    }
    if (file.size > maxImageBytes) {
      return { ok: false, reason: "Image must be 5 MB or smaller" };
    }
    return { ok: true };
  }

  var host = document.querySelector("[data-website-field-editor]");
  if (!host) return;

  var overlay = host.querySelector("[data-website-field-editor-overlay]");
  var panel = host.querySelector("[data-website-field-editor-panel]");
  var bodyEl = host.querySelector("[data-website-field-editor-body]");
  var titleEl = host.querySelector("[data-website-field-editor-title]");
  var statusEl = host.querySelector("[data-website-field-editor-status]");
  var saveBtn = host.querySelector("[data-website-field-editor-save]");
  var cancelBtn = host.querySelector("[data-website-field-editor-cancel]");
  var activeField = null;
  var lastTrigger = null;
  var focusTrapHandler = null;
  var state = null;
  var dirtyBaseline = null;
  var dirtyController = null;

  function syncDirtyController() {
    if (!window.GpWebsiteLifecycle) return;
    if (dirtyController && dirtyController.isDirty()) {
      window.GpWebsiteLifecycle.setLocalDirtyController(dirtyController);
    } else {
      window.GpWebsiteLifecycle.clearLocalDirtyController(dirtyController);
    }
  }

  function clearDirtyController() {
    dirtyBaseline = null;
    if (window.GpWebsiteLifecycle) {
      window.GpWebsiteLifecycle.clearLocalDirtyController(dirtyController);
    }
    dirtyController = null;
  }

  function captureTextBaseline(textState) {
    if (!textState || !textState.input) return "";
    return String(textState.input.value || "");
  }

  function textIsDirty(textState) {
    if (!textState || !textState.input || dirtyBaseline == null) return false;
    return String(textState.input.value || "") !== String(dirtyBaseline);
  }

  function captureImageBaseline(imageState) {
    return {
      alt: imageState && imageState.altInput ? String(imageState.altInput.value || "") : "",
      pendingFile: Boolean(state && state.pendingFile),
      pendingMediaId: state && state.pendingMediaId ? String(state.pendingMediaId) : "",
    };
  }

  function imageIsDirty(imageState) {
    if (!imageState || dirtyBaseline == null || !state) return false;
    var current = captureImageBaseline(imageState);
    return (
      current.pendingFile !== dirtyBaseline.pendingFile ||
      current.pendingMediaId !== dirtyBaseline.pendingMediaId ||
      current.alt !== dirtyBaseline.alt
    );
  }

  function installDirtyTracking() {
    dirtyController = {
      isDirty: function () {
        if (!state) return false;
        if (state.kind === "image") return imageIsDirty(state.image);
        return textIsDirty(state.text);
      },
      discard: function () {
        if (!state) return;
        if (state.kind === "image" && state.image) {
          if (state.pendingObjectUrl) URL.revokeObjectURL(state.pendingObjectUrl);
          state.pendingFile = null;
          state.pendingMediaId = null;
          state.pendingObjectUrl = null;
          if (state.image.altInput) state.image.altInput.value = dirtyBaseline ? dirtyBaseline.alt : "";
          if (state.image.showNewPreview) state.image.showNewPreview("");
        } else if (state.text && state.text.input && dirtyBaseline != null) {
          state.text.input.value = dirtyBaseline;
        }
        syncDirtyController();
      },
    };
    if (state.kind === "text" && state.text && state.text.input) {
      dirtyBaseline = captureTextBaseline(state.text);
      state.text.input.addEventListener("input", syncDirtyController);
    } else if (state.kind === "image" && state.image) {
      dirtyBaseline = captureImageBaseline(state.image);
      if (state.image.altInput) {
        state.image.altInput.addEventListener("input", syncDirtyController);
      }
    }
    syncDirtyController();
  }

  function setStatus(message, isError) {
    if (!statusEl) return;
    statusEl.textContent = message || "";
    statusEl.classList.toggle("is-error", Boolean(isError));
  }

  function setBusy(busy) {
    host.setAttribute("aria-busy", busy ? "true" : "false");
    if (saveBtn) saveBtn.disabled = Boolean(busy);
    if (cancelBtn) cancelBtn.disabled = Boolean(busy);
  }

  function isOpen() {
    return !host.hidden;
  }

  function installFocusTrap() {
    removeFocusTrap();
    focusTrapHandler = function (ev) {
      if (ev.key !== "Tab" || !panel) return;
      var focusable = panel.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (ev.shiftKey && document.activeElement === first) {
        ev.preventDefault();
        last.focus();
      } else if (!ev.shiftKey && document.activeElement === last) {
        ev.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", focusTrapHandler);
  }

  function removeFocusTrap() {
    if (focusTrapHandler) {
      document.removeEventListener("keydown", focusTrapHandler);
      focusTrapHandler = null;
    }
  }

  function openDialog() {
    host.hidden = false;
    if (overlay) overlay.hidden = false;
    if (panel) panel.hidden = false;
    document.body.classList.add("gp-website-field-editor-open");
    installFocusTrap();
  }

  function closeDialog() {
    host.hidden = true;
    if (overlay) overlay.hidden = true;
    if (panel) panel.hidden = true;
    document.body.classList.remove("gp-website-field-editor-open");
    removeFocusTrap();
    if (state && state.pendingObjectUrl) {
      URL.revokeObjectURL(state.pendingObjectUrl);
    }
    state = null;
    activeField = null;
    clearDirtyController();
    if (bodyEl) bodyEl.textContent = "";
    setStatus("", false);
    setBusy(false);
    if (lastTrigger && typeof lastTrigger.focus === "function") {
      try {
        lastTrigger.focus();
      } catch (err) {
        /* ignore */
      }
    }
  }

  function fieldLabel(fieldEl) {
    var label = fieldEl.getAttribute("data-website-label");
    if (label) return label;
    var key = fieldEl.getAttribute("data-website-key") || "field";
    var short = key.split(".").pop() || key;
    return "Edit " + short.replace(/_/g, " ");
  }

  function isLogoField(fieldEl) {
    return (
      fieldEl.getAttribute("data-website-variant") === "logo" ||
      fieldEl.classList.contains("ac-website-editable--logo") ||
      fieldEl.getAttribute("data-website-key") === "home.logo"
    );
  }

  function isImageField(fieldEl) {
    var type = fieldEl.getAttribute("data-website-type") || "";
    return type === "image" || isLogoField(fieldEl);
  }

  function buildTextBody(fieldEl) {
    var multiline = fieldEl.getAttribute("data-website-type") === "textarea";
    var current =
      fieldEl.getAttribute("data-website-published-value") ||
      fieldEl.getAttribute("data-website-value") ||
      "";
    var draft = fieldEl.getAttribute("data-website-value") || "";
    var maxLen = fieldEl.getAttribute("data-website-max") || (multiline ? "500" : "120");
    var inputType = fieldEl.getAttribute("data-website-input-type") || "text";

    bodyEl.innerHTML =
      '<div class="gp-website-field-editor__section">' +
      '<span class="gp-website-field-editor__label">Current value</span>' +
      '<div class="gp-website-field-editor__readonly" data-website-field-current="1"></div>' +
      "</div>" +
      '<div class="gp-website-field-editor__section">' +
      '<label class="gp-website-field-editor__label" for="gp-website-field-input">New value</label>' +
      (multiline
        ? '<textarea id="gp-website-field-input" class="gp-website-field-editor__input" data-website-input="1" rows="5" maxlength="' +
          maxLen +
          '"></textarea>'
        : '<input id="gp-website-field-input" class="gp-website-field-editor__input" data-website-input="1" type="' +
          inputType +
          '" maxlength="' +
          maxLen +
          '" autocomplete="off" />') +
      "</div>";

    var currentEl = bodyEl.querySelector("[data-website-field-current]");
    var input = bodyEl.querySelector("[data-website-input]");
    if (currentEl) currentEl.textContent = current || "—";
    if (input) {
      input.value = draft;
      input.focus();
      if (!multiline && typeof input.select === "function") input.select();
    }
    return { input: input, multiline: multiline };
  }

  function buildImageBody(fieldEl) {
    var logo = isLogoField(fieldEl);
    bodyEl.innerHTML =
      '<div class="gp-website-field-editor__media-grid">' +
      '<div class="gp-website-field-editor__section">' +
      '<span class="gp-website-field-editor__label">Current image</span>' +
      '<div class="gp-website-field-editor__preview-wrap">' +
      '<img class="gp-website-field-editor__preview" data-website-field-current-image="1" alt="" />' +
      "</div>" +
      "</div>" +
      '<div class="gp-website-field-editor__section">' +
      '<span class="gp-website-field-editor__label">New image</span>' +
      '<div class="gp-website-field-editor__preview-wrap">' +
      '<img class="gp-website-field-editor__preview" data-website-field-new-image="1" alt="" hidden />' +
      '<span class="gp-website-field-editor__preview-empty" data-website-field-new-empty="1">No image selected yet</span>' +
      "</div>" +
      "</div>" +
      "</div>" +
      (logo
        ? '<p class="gp-website-field-editor__hint">Use a square PNG or SVG with a transparent background when possible.</p>'
        : "") +
      '<label class="gp-website-field-editor__file">' +
      "<span>Choose or replace image</span>" +
      '<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" data-website-file="1" />' +
      "</label>" +
      (mediaUrl
        ? '<button type="button" class="gp-website-field-editor__link-btn" data-website-library="1">Choose existing</button>'
        : "") +
      '<div class="gp-website-library" data-website-library-panel="1" hidden></div>' +
      '<label class="gp-website-field-editor__alt">' +
      "Alt text" +
      '<input type="text" maxlength="240" data-website-alt="1" autocomplete="off" enterkeyhint="done" />' +
      "</label>" +
      '<progress class="gp-website-field-editor__progress" data-website-progress="1" hidden max="100" value="0"></progress>';

    var canvasImg = fieldEl.querySelector("[data-website-image]");
    var currentSrc = canvasImg ? canvasImg.getAttribute("src") || "" : "";
    var currentAlt = canvasImg ? canvasImg.getAttribute("alt") || "" : "";
    var mediaId = fieldEl.getAttribute("data-website-media-id") || "";

    var currentPreview = bodyEl.querySelector("[data-website-field-current-image]");
    var newPreview = bodyEl.querySelector("[data-website-field-new-image]");
    var newEmpty = bodyEl.querySelector("[data-website-field-new-empty]");
    var altInput = bodyEl.querySelector("[data-website-alt]");
    var fileInput = bodyEl.querySelector("[data-website-file]");
    var libraryBtn = bodyEl.querySelector("[data-website-library]");
    var libraryPanel = bodyEl.querySelector("[data-website-library-panel]");
    var progress = bodyEl.querySelector("[data-website-progress]");

    if (currentPreview && currentSrc) {
      currentPreview.src = currentSrc;
      currentPreview.alt = currentAlt;
    } else if (currentPreview) {
      currentPreview.hidden = true;
    }
    if (altInput) altInput.value = currentAlt;

    function showNewPreview(src) {
      if (!newPreview) return;
      if (src) {
        newPreview.src = src;
        newPreview.hidden = false;
        if (newEmpty) newEmpty.hidden = true;
      } else {
        newPreview.hidden = true;
        if (newEmpty) newEmpty.hidden = false;
      }
    }

    if (fileInput) {
      fileInput.addEventListener("change", function () {
        var file = fileInput.files && fileInput.files[0];
        if (!file) return;
        var check = validateImageFile(file);
        if (!check.ok) {
          fileInput.value = "";
          setStatus(check.reason, true);
          return;
        }
        if (state.pendingObjectUrl) URL.revokeObjectURL(state.pendingObjectUrl);
        state.pendingFile = file;
        state.pendingMediaId = null;
        state.pendingObjectUrl = URL.createObjectURL(file);
        showNewPreview(state.pendingObjectUrl);
        setStatus("Preview only — save draft to keep this image", false);
        syncDirtyController();
      });
    }

    if (libraryBtn && libraryPanel && mediaUrl) {
      libraryBtn.addEventListener("click", function () {
        libraryPanel.hidden = false;
        libraryPanel.textContent = "Loading library…";
        fetch(mediaUrl, {
          credentials: "same-origin",
          headers: { Accept: "application/json", "X-CSRF-Token": csrfToken },
        })
          .then(function (res) {
            return res.json();
          })
          .then(function (out) {
            libraryPanel.textContent = "";
            var items = (out && out.media) || [];
            if (!items.length) {
              libraryPanel.textContent = "No images in the library yet.";
              return;
            }
            items.forEach(function (item) {
              var pick = document.createElement("button");
              pick.type = "button";
              pick.className = "gp-website-library__item";
              pick.setAttribute("data-website-library-item", "1");
              var thumb = document.createElement("img");
              thumb.src = item.previewUrl || item.publicSrc || "";
              thumb.alt = item.altText || item.title || "Library image";
              pick.appendChild(thumb);
              pick.addEventListener("click", function () {
                state.pendingFile = null;
                state.pendingMediaId = item.id || item.mediaId || "";
                if (fileInput) fileInput.value = "";
                if (state.pendingObjectUrl) {
                  URL.revokeObjectURL(state.pendingObjectUrl);
                  state.pendingObjectUrl = null;
                }
                showNewPreview(item.previewUrl || item.publicSrc || mediaItemUrl(state.pendingMediaId));
                if (altInput && (item.altText || item.alt)) {
                  altInput.value = item.altText || item.alt;
                }
                libraryPanel.hidden = true;
                setStatus("Library image selected — save draft to keep it", false);
                syncDirtyController();
              });
              libraryPanel.appendChild(pick);
            });
          })
          .catch(function () {
            libraryPanel.textContent = "Could not load media library";
          });
      });
    }

    return {
      canvasImg: canvasImg,
      altInput: altInput,
      progress: progress,
      originalSrc: currentSrc,
      originalAlt: currentAlt,
      originalMediaId: mediaId,
      showNewPreview: showNewPreview,
    };
  }

  function openField(fieldEl, trigger) {
    if (!fieldEl) return;
    lastTrigger = trigger || fieldEl.querySelector("[data-website-start]");
    activeField = fieldEl;
    setStatus("", false);

    var image = isImageField(fieldEl);
    if (titleEl) {
      if (image && isLogoField(fieldEl)) titleEl.textContent = "Edit logo";
      else if (image) titleEl.textContent = "Edit image";
      else titleEl.textContent = fieldLabel(fieldEl);
    }

    state = {
      kind: image ? "image" : "text",
      pendingFile: null,
      pendingMediaId: null,
      pendingObjectUrl: null,
    };

    if (image) {
      state.image = buildImageBody(fieldEl);
    } else {
      state.text = buildTextBody(fieldEl);
    }

    installDirtyTracking();
    openDialog();
  }

  function updateCanvasText(fieldEl, value) {
    fieldEl.setAttribute("data-website-value", value);
    var valueEl = fieldEl.querySelector("[data-website-value-text]");
    if (valueEl) valueEl.textContent = value;
    syncEmptyDisplayState(fieldEl);
  }

  function syncEmptyDisplayState(fieldEl) {
    if (!fieldEl) return;
    var display = fieldEl.querySelector("[data-website-display]");
    if (!display) return;
    var empty = !String(fieldEl.getAttribute("data-website-value") || "").trim();
    display.classList.toggle("is-empty", empty);
    if (empty) {
      var hint = "Click to add text";
      var type = String(fieldEl.getAttribute("data-website-type") || "");
      var key = String(fieldEl.getAttribute("data-website-key") || "");
      if (type === "textarea") hint = "Click to add text";
      else if (/\.heading$/.test(key) || fieldEl.querySelector("h1,h2,h3")) hint = "Click to add heading";
      else if (/buttonText/.test(key)) hint = "Click to add button label";
      display.setAttribute("data-empty-hint", hint);
    } else {
      display.removeAttribute("data-empty-hint");
    }
  }

  function updateCanvasImage(fieldEl, src, alt, mediaId) {
    var img = fieldEl.querySelector("[data-website-image]");
    var placeholder = fieldEl.querySelector("[data-website-image-placeholder]");
    if (mediaId) fieldEl.setAttribute("data-website-media-id", mediaId);
    if (img) {
      if (src) {
        img.setAttribute("src", src);
        img.setAttribute("alt", alt || "");
        img.hidden = false;
      }
    }
    if (placeholder) placeholder.hidden = Boolean(src);
  }

  function saveText() {
    if (!activeField || !state || !state.text || !state.text.input) return;
    var value = state.text.input.value;
    setBusy(true);
    setStatus("Saving…", false);
    postJson(saveUrl, {
      contentKey: activeField.getAttribute("data-website-key"),
      value: value,
    })
      .then(function (out) {
        setBusy(false);
        if (out && out.ok && out.published === true) {
          setStatus("Save must not publish. Draft was not applied as live.", true);
          return;
        }
        if (out && out.ok) {
          updateCanvasText(activeField, value);
          markDraftSaved();
          closeDialog();
        } else {
          setStatus((out && (out.reason || out.code)) || "Could not save", true);
        }
      })
      .catch(function () {
        setBusy(false);
        setStatus("Could not save", true);
      });
  }

  function saveImage() {
    if (!activeField || !state || !state.image) return;
    var imgState = state.image;
    var altText = imgState.altInput ? imgState.altInput.value : "";
    setBusy(true);
    setStatus(state.pendingFile ? "Uploading…" : "Saving…", false);
    if (imgState.progress && state.pendingFile) imgState.progress.hidden = false;

    var chain = state.pendingFile
      ? uploadImage(state.pendingFile, altText, function (pct) {
          if (imgState.progress) imgState.progress.value = pct;
        })
      : Promise.resolve(null);

    chain
      .then(function (uploaded) {
        var value = {
          alt: altText,
          mediaId:
            uploaded && uploaded.media && uploaded.media.id
              ? uploaded.media.id
              : state.pendingMediaId || imgState.originalMediaId || null,
          src:
            uploaded && uploaded.media && uploaded.media.id
              ? mediaItemUrl(uploaded.media.id)
              : state.pendingMediaId
                ? mediaItemUrl(state.pendingMediaId)
                : imgState.originalSrc,
        };
        return postJson(saveUrl, {
          contentKey: activeField.getAttribute("data-website-key"),
          value: value,
        }).then(function (out) {
          out.uploaded = uploaded;
          out.value = value;
          return out;
        });
      })
      .then(function (out) {
        setBusy(false);
        if (imgState.progress) imgState.progress.hidden = true;
        if (out && out.ok && out.published === true) {
          setStatus("Save must not publish. Draft was not applied as live.", true);
          return;
        }
        if (out && out.ok) {
          updateCanvasImage(activeField, out.value.src, altText, out.value.mediaId);
          markDraftSaved();
          closeDialog();
        } else {
          setStatus((out && (out.reason || out.code)) || "Could not save", true);
        }
      })
      .catch(function (err) {
        setBusy(false);
        if (imgState.progress) imgState.progress.hidden = true;
        setStatus((err && (err.reason || err.code)) || "Could not upload image", true);
      });
  }

  function save() {
    if (!state) return;
    if (state.kind === "image") saveImage();
    else saveText();
  }

  function isLocallyDirty() {
    return (
      dirtyController &&
      typeof dirtyController.isDirty === "function" &&
      dirtyController.isDirty()
    );
  }

  function cancel() {
    if (
      isLocallyDirty() &&
      window.GpWebsiteLifecycle &&
      typeof window.GpWebsiteLifecycle.guardNavigation === "function"
    ) {
      window.GpWebsiteLifecycle.guardNavigation(closeDialog);
      return;
    }
    closeDialog();
  }

  if (saveBtn) saveBtn.addEventListener("click", save);
  if (cancelBtn) cancelBtn.addEventListener("click", cancel);
  host.querySelectorAll("[data-website-field-editor-dismiss]").forEach(function (btn) {
    btn.addEventListener("click", cancel);
  });
  document.addEventListener("keydown", function (ev) {
    if (!isOpen()) return;
    if (ev.key === "Escape") {
      ev.preventDefault();
      cancel();
    }
  });

  document.querySelectorAll("[data-website-key]").forEach(function (el) {
    syncEmptyDisplayState(el);
    var startBtn = el.querySelector("[data-website-start]");
    if (!startBtn) return;
    startBtn.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      if (isOpen()) return;
      openField(el, startBtn);
    });
  });
})();

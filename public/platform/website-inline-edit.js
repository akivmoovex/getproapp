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

  function markDraftSaved(detail) {
    var payload = detail && typeof detail === "object" ? detail : {};
    document.dispatchEvent(
      new CustomEvent("gp:website-save-success", {
        detail: {
          pendingChangeCount:
            payload.pendingChangeCount != null ? Number(payload.pendingChangeCount) : undefined,
          meaningful: payload.meaningful !== false,
        },
      })
    );
    if (chrome) chrome.setAttribute("data-draft", "1");
    // Do not locally invent pending counts — Change Manager UI uses server counts.
  }

  function markSaveStart() {
    window.__gpCmBusy = true;
    document.dispatchEvent(new CustomEvent("gp:website-save-start"));
  }

  function markUploadStart() {
    window.__gpCmBusy = true;
    document.dispatchEvent(new CustomEvent("gp:website-upload-start"));
  }

  function markSaveError(reason) {
    window.__gpCmBusy = false;
    document.dispatchEvent(
      new CustomEvent("gp:website-save-error", {
        detail: { reason: reason || "Save failed" },
      })
    );
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
    })
      .then(function (res) {
        return res.text().then(function (text) {
          var out = {};
          try {
            out = text ? JSON.parse(text) : {};
          } catch (err) {
            out = { ok: false, code: "invalid_response", reason: "Could not save" };
          }
          out = out || {};
          out.httpStatus = res.status;
          if (!res.ok && out.ok !== false) out.ok = false;
          return out;
        });
      })
      .catch(function () {
        return { ok: false, code: "network_error", reason: "Save failed — check your connection and retry" };
      });
  }

  function draftStorageKey(contentKey) {
    var org =
      (chrome && chrome.getAttribute("data-organization-key")) ||
      (chrome && chrome.getAttribute("data-clinic-key")) ||
      (document.querySelector("[data-clinic-key]") &&
        document.querySelector("[data-clinic-key]").getAttribute("data-clinic-key")) ||
      "";
    return "gp-website-draft:" + org + ":" + String(contentKey || "");
  }

  function rememberLocalDraft(contentKey, value) {
    try {
      if (!contentKey) return;
      window.sessionStorage.setItem(
        draftStorageKey(contentKey),
        JSON.stringify({ value: value, at: Date.now() })
      );
    } catch (err) {
      /* ignore quota / private mode */
    }
  }

  function clearLocalDraft(contentKey) {
    try {
      if (!contentKey) return;
      window.sessionStorage.removeItem(draftStorageKey(contentKey));
    } catch (err) {
      /* ignore */
    }
  }

  function readLocalDraft(contentKey) {
    try {
      var raw = window.sessionStorage.getItem(draftStorageKey(contentKey));
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.value !== "string") return null;
      return parsed.value;
    } catch (err) {
      return null;
    }
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

  /** Mirrors server IMAGE_SLOT_REGISTRY separate-framing policy (server remains authoritative). */
  var SLOT_SEPARATE_FRAMING = {
    "home.hero.image": true,
    "about.story.image": true,
    "home.logo": false,
    "seo.image": false,
  };

  function clampPlacementNum(n, min, max, fallback) {
    var v = typeof n === "number" ? n : Number(n);
    if (!isFinite(v)) return fallback;
    if (v < min) return min;
    if (v > max) return max;
    return Math.round(v * 1000) / 1000;
  }

  function defaultFrame() {
    return { fit: "cover", x: 50, y: 50, zoom: 1 };
  }

  function clonePlacement(raw) {
    if (!raw || typeof raw !== "object") return null;
    var base = {
      v: 1,
      fit: raw.fit === "contain" ? "contain" : "cover",
      x: clampPlacementNum(raw.x != null ? raw.x : raw.focalX, 0, 100, 50),
      y: clampPlacementNum(raw.y != null ? raw.y : raw.focalY, 0, 100, 50),
      zoom: clampPlacementNum(raw.zoom, 1, 3, 1),
    };
    if (raw.mobile && typeof raw.mobile === "object") {
      base.mobile = {
        fit: raw.mobile.fit === "contain" ? "contain" : "cover",
        x: clampPlacementNum(raw.mobile.x, 0, 100, base.x),
        y: clampPlacementNum(raw.mobile.y, 0, 100, base.y),
        zoom: clampPlacementNum(raw.mobile.zoom, 1, 3, base.zoom),
      };
    }
    return base;
  }

  function slotAllowsSeparateFraming(fieldEl) {
    if (!fieldEl) return false;
    var attr = fieldEl.getAttribute("data-website-slot-separate");
    if (attr === "0" || attr === "false") return false;
    if (attr === "1" || attr === "true") return true;
    var key = String(fieldEl.getAttribute("data-website-key") || "").toLowerCase();
    if (Object.prototype.hasOwnProperty.call(SLOT_SEPARATE_FRAMING, key)) {
      return SLOT_SEPARATE_FRAMING[key] === true;
    }
    return String(fieldEl.getAttribute("data-website-variant") || "") !== "logo";
  }

  function readFieldPlacement(fieldEl) {
    if (!fieldEl) return null;
    var raw = fieldEl.getAttribute("data-website-image-placement");
    if (raw) {
      try {
        return clonePlacement(JSON.parse(raw));
      } catch (e) {
        /* fall through */
      }
    }
    var img = fieldEl.querySelector("[data-website-image]");
    if (!img || !img.style) return null;
    var x = img.style.getPropertyValue("--gp-img-x");
    var y = img.style.getPropertyValue("--gp-img-y");
    var zoom = img.style.getPropertyValue("--gp-img-zoom");
    var fit = img.style.getPropertyValue("--gp-img-fit") || img.style.objectFit;
    if (!x && !y && !zoom && !fit) return null;
    var placement = {
      v: 1,
      fit: String(fit || "cover").indexOf("contain") >= 0 ? "contain" : "cover",
      x: clampPlacementNum(parseFloat(x), 0, 100, 50),
      y: clampPlacementNum(parseFloat(y), 0, 100, 50),
      zoom: clampPlacementNum(parseFloat(zoom), 1, 3, 1),
    };
    var mx = img.style.getPropertyValue("--gp-img-mobile-x");
    if (mx) {
      placement.mobile = {
        fit:
          String(img.style.getPropertyValue("--gp-img-mobile-fit") || placement.fit).indexOf("contain") >= 0
            ? "contain"
            : "cover",
        x: clampPlacementNum(parseFloat(mx), 0, 100, placement.x),
        y: clampPlacementNum(parseFloat(img.style.getPropertyValue("--gp-img-mobile-y")), 0, 100, placement.y),
        zoom: clampPlacementNum(
          parseFloat(img.style.getPropertyValue("--gp-img-mobile-zoom")),
          1,
          3,
          placement.zoom
        ),
      };
    }
    return placement;
  }

  function placementIsDefault(p) {
    if (!p) return true;
    if ((p.fit || "cover") !== "cover") return false;
    if (clampPlacementNum(p.x, 0, 100, 50) !== 50) return false;
    if (clampPlacementNum(p.y, 0, 100, 50) !== 50) return false;
    if (clampPlacementNum(p.zoom, 1, 3, 1) !== 1) return false;
    if (p.mobile) return false;
    return true;
  }

  function serializePlacementForSave(placement, allowMobile) {
    var p = clonePlacement(placement);
    if (!p || placementIsDefault(p)) return null;
    var out = { v: 1, fit: p.fit, x: p.x, y: p.y, zoom: p.zoom };
    if (allowMobile && p.mobile) {
      out.mobile = {
        fit: p.mobile.fit,
        x: p.mobile.x,
        y: p.mobile.y,
        zoom: p.mobile.zoom,
      };
    }
    return out;
  }

  function applyPlacementToElement(el, placement) {
    if (!el) return;
    var className = String(el.className || "");
    className = className.replace(/\bgp-website-image--placed\b/g, "").replace(/\s+/g, " ").trim();
    if (!placement) {
      el.className = className;
      el.removeAttribute("style");
      return;
    }
    var p = clonePlacement(placement) || defaultFrame();
    p.v = 1;
    el.className = (className + " gp-website-image--placed").trim();
    var parts = [
      "object-fit:" + p.fit,
      "object-position:" + p.x + "% " + p.y + "%",
      "--gp-img-fit:" + p.fit,
      "--gp-img-x:" + p.x + "%",
      "--gp-img-y:" + p.y + "%",
      "--gp-img-zoom:" + p.zoom,
      "transform:scale(" + p.zoom + ")",
      "transform-origin:" + p.x + "% " + p.y + "%",
    ];
    if (p.mobile) {
      parts.push("--gp-img-mobile-fit:" + p.mobile.fit);
      parts.push("--gp-img-mobile-x:" + p.mobile.x + "%");
      parts.push("--gp-img-mobile-y:" + p.mobile.y + "%");
      parts.push("--gp-img-mobile-zoom:" + p.mobile.zoom);
    }
    el.setAttribute("style", parts.join(";"));
  }

  function placementFinger(p) {
    try {
      return JSON.stringify(serializePlacementForSave(p, true) || null);
    } catch (e) {
      return "";
    }
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
      pendingRemove: Boolean(state && state.pendingRemove),
      placement: placementFinger(state && state.placement),
    };
  }

  function imageIsDirty(imageState) {
    if (!imageState || dirtyBaseline == null || !state) return false;
    var current = captureImageBaseline(imageState);
    return (
      current.pendingFile !== dirtyBaseline.pendingFile ||
      current.pendingMediaId !== dirtyBaseline.pendingMediaId ||
      current.pendingRemove !== dirtyBaseline.pendingRemove ||
      current.alt !== dirtyBaseline.alt ||
      current.placement !== dirtyBaseline.placement
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
          state.pendingRemove = false;
          state.placement = clonePlacement(state.originalPlacement);
          if (state.image.altInput) state.image.altInput.value = dirtyBaseline ? dirtyBaseline.alt : "";
          if (state.image.showNewPreview) state.image.showNewPreview("");
          if (state.image.refreshFraming) state.image.refreshFraming();
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
    var contentKey = fieldEl.getAttribute("data-website-key") || "";
    var recovered = readLocalDraft(contentKey);
    if (recovered != null && recovered !== draft) {
      draft = recovered;
    }
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
    if (recovered != null && recovered !== (fieldEl.getAttribute("data-website-value") || "")) {
      setStatus("Restored unsaved text from this browser session. Save to keep it.", false);
    }
    return { input: input, multiline: multiline };
  }

  function buildImageBody(fieldEl) {
    var logo = isLogoField(fieldEl);
    var canvasImg = fieldEl.querySelector("[data-website-image]");
    var currentSrc = canvasImg ? canvasImg.getAttribute("src") || "" : "";
    var currentAlt = canvasImg ? canvasImg.getAttribute("alt") || "" : "";
    var mediaId = fieldEl.getAttribute("data-website-media-id") || "";
    var hasCurrent = Boolean(currentSrc);
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
      '<div class="gp-website-field-editor__media-actions">' +
      '<label class="gp-website-field-editor__file gp-website-field-editor__file--primary">' +
      "<span>" +
      (hasCurrent ? "Replace image" : "Upload from computer") +
      "</span>" +
      '<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" data-website-file="1" />' +
      "</label>" +
      (mediaUrl
        ? '<button type="button" class="gp-website-field-editor__link-btn" data-website-library="1">Choose from Image Library</button>'
        : "") +
      '<button type="button" class="gp-website-field-editor__link-btn" data-website-adjust="1"' +
      (hasCurrent ? "" : " hidden") +
      ">Adjust Picture</button>" +
      '<button type="button" class="gp-website-field-editor__link-btn" data-website-remove-image="1"' +
      (hasCurrent ? "" : " hidden") +
      ">Remove image</button>" +
      "</div>" +
      '<div class="gp-website-library" data-website-library-panel="1" hidden></div>' +
      '<div class="gp-website-framing" data-website-framing="1" hidden>' +
      '<div class="gp-website-framing__head">' +
      '<span class="gp-website-field-editor__label">Crop &amp; position</span>' +
      '<p class="gp-website-framing__note">Drag to reposition. Framing applies only to this image slot — the original library file is never cropped.</p>' +
      "</div>" +
      '<div class="gp-website-framing__modes" data-website-frame-modes hidden>' +
      '<button type="button" class="gp-website-framing__mode is-current" data-website-frame-mode="desktop">Desktop</button>' +
      '<button type="button" class="gp-website-framing__mode" data-website-frame-mode="mobile">Mobile</button>' +
      "</div>" +
      '<div class="gp-website-framing__stage gp-website-framing__stage--desktop" data-website-frame-stage tabindex="0" role="img" aria-label="Drag to reposition image">' +
      '<img class="gp-website-framing__img" data-website-frame-img alt="" draggable="false" />' +
      "</div>" +
      '<div class="gp-website-framing__controls">' +
      '<label class="gp-website-framing__zoom">Zoom' +
      '<input type="range" min="1" max="3" step="0.05" value="1" data-website-frame-zoom />' +
      '<span data-website-frame-zoom-label>1.00×</span>' +
      "</label>" +
      '<div class="gp-website-framing__fit" role="group" aria-label="Fit mode">' +
      '<button type="button" class="gp-website-framing__fit-btn is-current" data-website-frame-fit="cover">Fill</button>' +
      '<button type="button" class="gp-website-framing__fit-btn" data-website-frame-fit="contain">Fit</button>' +
      "</div>" +
      '<button type="button" class="gp-website-field-editor__link-btn" data-website-frame-reset="1">Reset framing</button>' +
      "</div>" +
      '<p class="gp-website-framing__responsive-hint" data-website-frame-responsive-hint hidden>This image slot uses one framing for all screen sizes. The mobile preview below shows the responsive result.</p>' +
      "</div>" +
      '<label class="gp-website-field-editor__alt">' +
      "Alt text" +
      '<input type="text" maxlength="240" data-website-alt="1" autocomplete="off" enterkeyhint="done" />' +
      "</label>" +
      '<progress class="gp-website-field-editor__progress" data-website-progress="1" hidden max="100" value="0"></progress>';

    var currentPreview = bodyEl.querySelector("[data-website-field-current-image]");
    var newPreview = bodyEl.querySelector("[data-website-field-new-image]");
    var newEmpty = bodyEl.querySelector("[data-website-field-new-empty]");
    var altInput = bodyEl.querySelector("[data-website-alt]");
    var fileInput = bodyEl.querySelector("[data-website-file]");
    var libraryBtn = bodyEl.querySelector("[data-website-library]");
    var libraryPanel = bodyEl.querySelector("[data-website-library-panel]");
    var progress = bodyEl.querySelector("[data-website-progress]");
    var removeBtn = bodyEl.querySelector("[data-website-remove-image]");
    var adjustBtn = bodyEl.querySelector("[data-website-adjust]");
    var framingPanel = bodyEl.querySelector("[data-website-framing]");
    var frameModes = bodyEl.querySelector("[data-website-frame-modes]");
    var frameStage = bodyEl.querySelector("[data-website-frame-stage]");
    var frameImg = bodyEl.querySelector("[data-website-frame-img]");
    var frameZoom = bodyEl.querySelector("[data-website-frame-zoom]");
    var frameZoomLabel = bodyEl.querySelector("[data-website-frame-zoom-label]");
    var frameReset = bodyEl.querySelector("[data-website-frame-reset]");
    var responsiveHint = bodyEl.querySelector("[data-website-frame-responsive-hint]");
    var uploadLabel = bodyEl.querySelector(".gp-website-field-editor__file span");
    var allowSeparate = slotAllowsSeparateFraming(fieldEl);
    var contentKey = fieldEl.getAttribute("data-website-key") || "";

    state.originalPlacement = readFieldPlacement(fieldEl);
    state.placement = clonePlacement(state.originalPlacement);
    state.frameMode = "desktop";
    state.framingOpen = false;

    if (currentPreview && currentSrc) {
      currentPreview.src = currentSrc;
      currentPreview.alt = currentAlt;
    } else if (currentPreview) {
      currentPreview.hidden = true;
    }
    if (altInput) altInput.value = currentAlt;

    function activePreviewSrc() {
      if (state.pendingRemove) return "";
      if (state.pendingObjectUrl) return state.pendingObjectUrl;
      if (newPreview && !newPreview.hidden && newPreview.src) return newPreview.src;
      return currentSrc || "";
    }

    function activeFrame() {
      if (!state.placement) state.placement = Object.assign({ v: 1 }, defaultFrame());
      if (state.frameMode === "mobile" && allowSeparate) {
        if (!state.placement.mobile) {
          state.placement.mobile = {
            fit: state.placement.fit || "cover",
            x: state.placement.x,
            y: state.placement.y,
            zoom: state.placement.zoom,
          };
        }
        return state.placement.mobile;
      }
      return state.placement;
    }

    function setActiveFrame(patch) {
      var frame = activeFrame();
      Object.keys(patch).forEach(function (k) {
        frame[k] = patch[k];
      });
      if (state.frameMode === "mobile" && allowSeparate) {
        state.placement.mobile = frame;
      } else {
        state.placement.fit = frame.fit;
        state.placement.x = frame.x;
        state.placement.y = frame.y;
        state.placement.zoom = frame.zoom;
        state.placement.v = 1;
      }
    }

    function refreshFraming() {
      if (!frameImg || !frameStage) return;
      var src = activePreviewSrc();
      if (!src) {
        frameImg.removeAttribute("src");
        return;
      }
      frameImg.src = src;
      var frame = activeFrame();
      frameStage.classList.toggle("gp-website-framing__stage--mobile", state.frameMode === "mobile");
      frameStage.classList.toggle("gp-website-framing__stage--desktop", state.frameMode !== "mobile");
      applyPlacementToElement(frameImg, {
        v: 1,
        fit: frame.fit,
        x: frame.x,
        y: frame.y,
        zoom: frame.zoom,
      });
      if (frameZoom) frameZoom.value = String(frame.zoom);
      if (frameZoomLabel) frameZoomLabel.textContent = Number(frame.zoom).toFixed(2) + "×";
      bodyEl.querySelectorAll("[data-website-frame-fit]").forEach(function (btn) {
        btn.classList.toggle("is-current", btn.getAttribute("data-website-frame-fit") === frame.fit);
      });
      bodyEl.querySelectorAll("[data-website-frame-mode]").forEach(function (btn) {
        btn.classList.toggle("is-current", btn.getAttribute("data-website-frame-mode") === state.frameMode);
      });
      if (frameModes) frameModes.hidden = !allowSeparate;
      if (responsiveHint) responsiveHint.hidden = allowSeparate;
    }

    function showNewPreview(src) {
      if (!newPreview) return;
      if (src) {
        newPreview.src = src;
        newPreview.hidden = false;
        if (newEmpty) newEmpty.hidden = true;
        if (adjustBtn) adjustBtn.hidden = false;
      } else {
        newPreview.hidden = true;
        if (newEmpty) newEmpty.hidden = false;
        if (adjustBtn && !currentSrc) adjustBtn.hidden = true;
      }
      if (state.framingOpen) refreshFraming();
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
        if (!mediaUrl) {
          fileInput.value = "";
          setStatus("Media upload is unavailable. Reload the page or open Content Library from website settings.", true);
          return;
        }
        if (state.pendingObjectUrl) URL.revokeObjectURL(state.pendingObjectUrl);
        state.pendingFile = file;
        state.pendingMediaId = null;
        state.pendingRemove = false;
        state.pendingObjectUrl = URL.createObjectURL(file);
        showNewPreview(state.pendingObjectUrl);
        if (uploadLabel) uploadLabel.textContent = "Replace image";
        if (removeBtn) removeBtn.hidden = false;
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
              libraryPanel.textContent = "No images in the Image Library yet. Upload from your computer above.";
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
                state.pendingRemove = false;
                state.pendingMediaId = item.id || item.mediaId || "";
                if (fileInput) fileInput.value = "";
                if (state.pendingObjectUrl) {
                  URL.revokeObjectURL(state.pendingObjectUrl);
                  state.pendingObjectUrl = null;
                }
                showNewPreview(item.previewUrl || item.publicSrc || mediaItemUrl(state.pendingMediaId));
                if (uploadLabel) uploadLabel.textContent = "Replace image";
                if (removeBtn) removeBtn.hidden = false;
                if (altInput && (item.altText || item.alt)) {
                  altInput.value = item.altText || item.alt;
                }
                libraryPanel.hidden = true;
                setStatus("Image Library image selected — save draft to keep it", false);
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

    if (removeBtn) {
      removeBtn.addEventListener("click", function () {
        state.pendingFile = null;
        state.pendingMediaId = null;
        state.pendingRemove = true;
        state.placement = null;
        if (fileInput) fileInput.value = "";
        if (state.pendingObjectUrl) {
          URL.revokeObjectURL(state.pendingObjectUrl);
          state.pendingObjectUrl = null;
        }
        showNewPreview("");
        if (uploadLabel) uploadLabel.textContent = "Upload from computer";
        removeBtn.hidden = true;
        if (adjustBtn) adjustBtn.hidden = true;
        if (framingPanel) framingPanel.hidden = true;
        state.framingOpen = false;
        setStatus("Image will be removed when you save draft", false);
        syncDirtyController();
      });
    }

    if (adjustBtn && framingPanel) {
      adjustBtn.addEventListener("click", function () {
        if (!activePreviewSrc()) {
          setStatus("Choose or keep an image before adjusting framing", true);
          return;
        }
        if (!state.placement) state.placement = Object.assign({ v: 1 }, defaultFrame());
        state.framingOpen = true;
        framingPanel.hidden = false;
        refreshFraming();
        if (frameStage && typeof frameStage.focus === "function") frameStage.focus();
        setStatus("Adjust framing, then Save draft. Original library image stays unchanged.", false);
      });
    }

    if (frameModes) {
      frameModes.querySelectorAll("[data-website-frame-mode]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (!allowSeparate && btn.getAttribute("data-website-frame-mode") === "mobile") return;
          state.frameMode = btn.getAttribute("data-website-frame-mode") || "desktop";
          refreshFraming();
        });
      });
    }

    if (frameZoom) {
      frameZoom.addEventListener("input", function () {
        var z = clampPlacementNum(frameZoom.value, 1, 3, 1);
        setActiveFrame({ zoom: z });
        refreshFraming();
        syncDirtyController();
      });
    }

    bodyEl.querySelectorAll("[data-website-frame-fit]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setActiveFrame({ fit: btn.getAttribute("data-website-frame-fit") === "contain" ? "contain" : "cover" });
        refreshFraming();
        syncDirtyController();
      });
    });

    if (frameReset) {
      frameReset.addEventListener("click", function () {
        if (state.frameMode === "mobile" && allowSeparate && state.placement) {
          delete state.placement.mobile;
        } else {
          state.placement = Object.assign({ v: 1 }, defaultFrame());
        }
        state.frameMode = "desktop";
        refreshFraming();
        syncDirtyController();
        setStatus("Framing reset for this slot", false);
      });
    }

    if (frameStage) {
      var drag = null;
      function onPointerDown(ev) {
        if (!activePreviewSrc()) return;
        drag = {
          pointerId: ev.pointerId,
          x: ev.clientX,
          y: ev.clientY,
          frame: Object.assign({}, activeFrame()),
        };
        try {
          frameStage.setPointerCapture(ev.pointerId);
        } catch (e) {
          /* ignore */
        }
        ev.preventDefault();
      }
      function onPointerMove(ev) {
        if (!drag || drag.pointerId !== ev.pointerId) return;
        var rect = frameStage.getBoundingClientRect();
        var dx = ((ev.clientX - drag.x) / Math.max(rect.width, 1)) * 100;
        var dy = ((ev.clientY - drag.y) / Math.max(rect.height, 1)) * 100;
        setActiveFrame({
          x: clampPlacementNum(drag.frame.x - dx, 0, 100, 50),
          y: clampPlacementNum(drag.frame.y - dy, 0, 100, 50),
        });
        refreshFraming();
        syncDirtyController();
      }
      function onPointerUp(ev) {
        if (!drag || drag.pointerId !== ev.pointerId) return;
        drag = null;
      }
      frameStage.addEventListener("pointerdown", onPointerDown);
      frameStage.addEventListener("pointermove", onPointerMove);
      frameStage.addEventListener("pointerup", onPointerUp);
      frameStage.addEventListener("pointercancel", onPointerUp);
      frameStage.addEventListener("keydown", function (ev) {
        var step = ev.shiftKey ? 5 : 2;
        var frame = activeFrame();
        var next = { x: frame.x, y: frame.y };
        if (ev.key === "ArrowLeft") next.x = clampPlacementNum(frame.x - step, 0, 100, 50);
        else if (ev.key === "ArrowRight") next.x = clampPlacementNum(frame.x + step, 0, 100, 50);
        else if (ev.key === "ArrowUp") next.y = clampPlacementNum(frame.y - step, 0, 100, 50);
        else if (ev.key === "ArrowDown") next.y = clampPlacementNum(frame.y + step, 0, 100, 50);
        else return;
        ev.preventDefault();
        setActiveFrame(next);
        refreshFraming();
        syncDirtyController();
      });
    }

    return {
      canvasImg: canvasImg,
      altInput: altInput,
      progress: progress,
      originalSrc: currentSrc,
      originalAlt: currentAlt,
      originalMediaId: mediaId,
      contentKey: contentKey,
      allowSeparate: allowSeparate,
      showNewPreview: showNewPreview,
      refreshFraming: refreshFraming,
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
      pendingRemove: false,
      placement: null,
      originalPlacement: null,
      frameMode: "desktop",
      framingOpen: false,
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

  function updateCanvasImage(fieldEl, src, alt, mediaId, placement) {
    var img = fieldEl.querySelector("[data-website-image]");
    var placeholder = fieldEl.querySelector("[data-website-image-placeholder]");
    if (mediaId != null) fieldEl.setAttribute("data-website-media-id", mediaId || "");
    var savedPlacement = serializePlacementForSave(placement, slotAllowsSeparateFraming(fieldEl));
    if (savedPlacement) {
      try {
        fieldEl.setAttribute("data-website-image-placement", JSON.stringify(savedPlacement));
      } catch (e) {
        fieldEl.removeAttribute("data-website-image-placement");
      }
    } else {
      fieldEl.removeAttribute("data-website-image-placement");
    }
    if (img) {
      if (src) {
        img.setAttribute("src", src);
        img.setAttribute("alt", alt || "");
        img.hidden = false;
        applyPlacementToElement(img, savedPlacement);
      } else {
        img.removeAttribute("src");
        img.hidden = true;
        applyPlacementToElement(img, null);
      }
    }
    if (placeholder) placeholder.hidden = Boolean(src);
  }

  function fieldExpectedUpdatedAt(fieldEl) {
    if (!fieldEl) return null;
    var raw = fieldEl.getAttribute("data-website-updated-at");
    return raw && String(raw).trim() ? String(raw).trim() : null;
  }

  function rememberFieldUpdatedAt(fieldEl, out) {
    if (!fieldEl || !out) return;
    var next =
      (out.content && out.content.updatedAt) ||
      (out.expectedUpdatedAt) ||
      null;
    if (next) fieldEl.setAttribute("data-website-updated-at", String(next));
  }

  function saveText() {
    if (!activeField || !state || !state.text || !state.text.input) return;
    var value = state.text.input.value;
    var contentKey = activeField.getAttribute("data-website-key");
    rememberLocalDraft(contentKey, value);
    setBusy(true);
    setStatus("Saving…", false);
    markSaveStart();
    var payload = {
      contentKey: contentKey,
      value: value,
    };
    var expected = fieldExpectedUpdatedAt(activeField);
    if (expected) payload.expectedUpdatedAt = expected;
    postJson(saveUrl, payload)
      .then(function (out) {
        setBusy(false);
        if (out && out.ok && out.published === true) {
          markSaveError("Save must not publish");
          setStatus("Save must not publish. Draft was not applied as live.", true);
          syncDirtyController();
          return;
        }
        if (out && out.ok) {
          rememberFieldUpdatedAt(activeField, out);
          updateCanvasText(activeField, value);
          clearLocalDraft(contentKey);
          markDraftSaved({
            pendingChangeCount: out.pendingChangeCount,
            meaningful: true,
          });
          closeDialog();
        } else {
          var failReason =
            out && out.code === "conflict"
              ? "This field was updated elsewhere. Reload and try again."
              : (out && (out.reason || out.message || out.code)) ||
                "Save failed — your changes are still here. Retry.";
          markSaveError(failReason);
          setStatus(failReason, true);
          syncDirtyController();
        }
      })
      .catch(function () {
        setBusy(false);
        markSaveError("Save failed");
        setStatus("Save failed — your changes are still here. Retry.", true);
        syncDirtyController();
      });
  }

  function saveImage() {
    if (!activeField || !state || !state.image) return;
    var imgState = state.image;
    var altText = imgState.altInput ? imgState.altInput.value : "";
    setBusy(true);
    setStatus(state.pendingFile ? "Uploading…" : "Saving…", false);
    if (imgState.progress && state.pendingFile) imgState.progress.hidden = false;

    if (state.pendingRemove) {
      markSaveStart();
      var removePayload = {
        contentKey: activeField.getAttribute("data-website-key"),
        value: null,
      };
      var removeExpected = fieldExpectedUpdatedAt(activeField);
      if (removeExpected) removePayload.expectedUpdatedAt = removeExpected;
      return postJson(saveUrl, removePayload)
        .then(function (out) {
          setBusy(false);
          if (out && out.ok && out.published === true) {
            markSaveError("Save must not publish");
            setStatus("Save must not publish. Draft was not applied as live.", true);
            syncDirtyController();
            return;
          }
          if (out && out.ok) {
            rememberFieldUpdatedAt(activeField, out);
            updateCanvasImage(activeField, "", "", "");
            markDraftSaved({
              pendingChangeCount: out.pendingChangeCount,
              meaningful: true,
            });
            closeDialog();
          } else {
            var removeFail =
              out && out.code === "conflict"
                ? "This field was updated elsewhere. Reload and try again."
                : (out && (out.reason || out.message || out.code)) ||
                  "Save failed — your changes are still here. Retry.";
            markSaveError(removeFail);
            setStatus(removeFail, true);
            syncDirtyController();
          }
        })
        .catch(function () {
          setBusy(false);
          markSaveError("Save failed");
          setStatus("Save failed — your changes are still here. Retry.", true);
          syncDirtyController();
        });
    }

    if (state.pendingFile) {
      markUploadStart();
    } else {
      markSaveStart();
    }

    var chain = state.pendingFile
      ? uploadImage(state.pendingFile, altText, function (pct) {
          if (imgState.progress) imgState.progress.value = pct;
        }).then(function (uploaded) {
          markSaveStart();
          return uploaded;
        })
      : Promise.resolve(null);

    chain
      .then(function (uploaded) {
        var uploadedSrc =
          uploaded && uploaded.media
            ? uploaded.media.publicSrc || uploaded.media.previewUrl || ""
            : "";
        var value = {
          alt: altText,
          mediaId:
            uploaded && uploaded.media && uploaded.media.id
              ? uploaded.media.id
              : state.pendingMediaId || imgState.originalMediaId || null,
          src:
            uploadedSrc ||
            (uploaded && uploaded.media && uploaded.media.id
              ? mediaItemUrl(uploaded.media.id)
              : state.pendingMediaId
                ? mediaItemUrl(state.pendingMediaId)
                : imgState.originalSrc),
        };
        // Never persist blob:/data: previews — only mediaId + CDN/app delivery URLs.
        if (value.src && /^(blob:|data:)/i.test(String(value.src))) {
          value.src = uploadedSrc || (value.mediaId ? mediaItemUrl(value.mediaId) : "");
        }
        var placement = serializePlacementForSave(
          state.placement,
          imgState.allowSeparate === true || slotAllowsSeparateFraming(activeField)
        );
        if (placement) value.placement = placement;
        var imagePayload = {
          contentKey: activeField.getAttribute("data-website-key"),
          value: value,
        };
        var imageExpected = fieldExpectedUpdatedAt(activeField);
        if (imageExpected) imagePayload.expectedUpdatedAt = imageExpected;
        return postJson(saveUrl, imagePayload).then(function (out) {
          out.uploaded = uploaded;
          out.value = value;
          return out;
        });
      })
      .then(function (out) {
        setBusy(false);
        if (imgState.progress) imgState.progress.hidden = true;
        if (out && out.ok && out.published === true) {
          markSaveError("Save must not publish");
          setStatus("Save must not publish. Draft was not applied as live.", true);
          syncDirtyController();
          return;
        }
        if (out && out.ok) {
          var savedValue =
            out.content && out.content.draftValue && typeof out.content.draftValue === "object"
              ? out.content.draftValue
              : null;
          var paintSrc =
            (savedValue && savedValue.src) ||
            (out.uploaded && out.uploaded.media && (out.uploaded.media.publicSrc || out.uploaded.media.previewUrl)) ||
            (out.value && out.value.src) ||
            "";
          var paintMediaId =
            (savedValue && savedValue.mediaId) ||
            (out.value && out.value.mediaId) ||
            "";
          var paintPlacement =
            (savedValue && savedValue.placement) ||
            (out.value && out.value.placement) ||
            null;
          if (paintSrc && /^(blob:|data:)/i.test(String(paintSrc))) {
            paintSrc = "";
          }
          rememberFieldUpdatedAt(activeField, out);
          updateCanvasImage(activeField, paintSrc, altText, paintMediaId, paintPlacement);
          markDraftSaved({
            pendingChangeCount: out.pendingChangeCount,
            meaningful: true,
          });
          closeDialog();
        } else {
          var imageFail =
            out && out.code === "conflict"
              ? "This field was updated elsewhere. Reload and try again."
              : (out && (out.reason || out.message || out.code)) ||
                "Save failed — your changes are still here. Retry.";
          markSaveError(imageFail);
          setStatus(imageFail, true);
          syncDirtyController();
        }
      })
      .catch(function (err) {
        setBusy(false);
        if (imgState.progress) imgState.progress.hidden = true;
        var uploadFail =
          (err && (err.reason || err.code)) === "file_too_large"
            ? "Image must be 5 MB or smaller"
            : (err && (err.reason || err.code)) === "unsupported_type"
              ? "Use JPEG, PNG, WebP, or GIF"
              : (err && (err.reason || err.code)) ||
                "Upload/save failed — your changes are still here. Retry.";
        markSaveError(uploadFail);
        setStatus(uploadFail, true);
        syncDirtyController();
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
    var display = el.querySelector("[data-website-display]");
    if (display) {
      display.addEventListener("click", function (ev) {
        if (ev.target.closest("[data-website-start]")) return;
        ev.preventDefault();
        if (isOpen()) return;
        openField(el, startBtn);
      });
    }
  });
})();

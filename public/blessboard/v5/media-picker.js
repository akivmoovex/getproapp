/**
 * BlessBoard V5 shared media picker + upload dialog.
 * Uses existing content-admin media endpoints only — no storage credentials.
 */
(function () {
  "use strict";

  var MAX_IMAGE_BYTES = 5 * 1024 * 1024;
  var MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
  var ALLOWED = {
    "image/jpeg": { category: "image", maxBytes: MAX_IMAGE_BYTES },
    "image/png": { category: "image", maxBytes: MAX_IMAGE_BYTES },
    "image/webp": { category: "image", maxBytes: MAX_IMAGE_BYTES },
    "image/gif": { category: "image", maxBytes: MAX_IMAGE_BYTES },
    "application/pdf": { category: "document", maxBytes: MAX_DOCUMENT_BYTES },
  };

  var REASON_MESSAGES = {
    size_limit: "File exceeds the allowed size limit.",
    empty_file: "Choose a non-empty file.",
    unsupported_mime: "This file type is not allowed.",
    rejected_mime: "This file type is not allowed.",
    svg_rejected: "SVG files are not supported.",
    csrf: "Your session expired. Refresh the page and try again.",
    upload_failed: "Upload failed. Any temporary storage object was removed.",
    upload_error: "Upload failed before storage completed.",
    ownership: "This file could not be saved for this church.",
    key_exists: "A conflicting storage key already exists.",
    lookup: "Media library is temporarily unavailable.",
    not_found: "That media asset was not found.",
    archive_failed: "Archive failed.",
  };

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function formatBytes(n) {
    var v = Number(n) || 0;
    if (v < 1024) return v + " B";
    if (v < 1024 * 1024) return (v / 1024).toFixed(1) + " KB";
    return (v / (1024 * 1024)).toFixed(1) + " MB";
  }

  function reasonMessage(reason, cleanup) {
    var key = String(reason || "");
    if (key === "upload_failed" || cleanup === "removed") {
      return REASON_MESSAGES.upload_failed;
    }
    if (REASON_MESSAGES[key]) return REASON_MESSAGES[key];
    if (key) return "Upload failed: " + key + ".";
    return "Upload failed.";
  }

  function clientValidate(file) {
    if (!file) return { ok: false, reason: "empty_file" };
    var name = String(file.name || "").toLowerCase();
    if (name.endsWith(".svg") || String(file.type || "").indexOf("svg") !== -1) {
      return { ok: false, reason: "svg_rejected" };
    }
    var mime = String(file.type || "").toLowerCase();
    var rule = ALLOWED[mime];
    if (!rule) {
      // Browser may omit type; still allow by extension for known types, server validates signature.
      if (/\.(jpe?g|png|webp|gif)$/i.test(name)) {
        rule = { category: "image", maxBytes: MAX_IMAGE_BYTES };
      } else if (/\.pdf$/i.test(name)) {
        rule = { category: "document", maxBytes: MAX_DOCUMENT_BYTES };
      } else {
        return { ok: false, reason: "unsupported_mime" };
      }
    }
    if (file.size > rule.maxBytes) {
      return { ok: false, reason: "size_limit" };
    }
    return { ok: true, category: rule.category, mime: mime || null };
  }

  function ensureDialog() {
    var existing = document.getElementById("bb-media-picker-dialog");
    if (existing) return existing;

    var dialog = document.createElement("dialog");
    dialog.id = "bb-media-picker-dialog";
    dialog.className = "bb-media-picker-dialog";
    dialog.setAttribute("data-bb-media-picker-dialog", "1");
    dialog.setAttribute("aria-labelledby", "bb-media-picker-title");
    dialog.innerHTML =
      '<div class="bb-media-picker-dialog__frame">' +
      '  <header class="bb-media-picker-dialog__head">' +
      "    <div>" +
      '      <h2 id="bb-media-picker-title">Media library</h2>' +
      '      <p data-bb-media-subtitle>Upload or select a church-owned asset. SVG is not allowed.</p>' +
      "    </div>" +
      '    <button type="button" class="bb-media-picker-dialog__close" data-bb-media-close aria-label="Close">' +
      '      <span class="material-symbols-outlined" aria-hidden="true">close</span>' +
      "    </button>" +
      "  </header>" +
      '  <div class="bb-media-picker-tabs" role="tablist">' +
      '    <button type="button" role="tab" data-bb-media-tab="upload" aria-selected="true">Upload</button>' +
      '    <button type="button" role="tab" data-bb-media-tab="library" aria-selected="false">Library</button>' +
      "  </div>" +
      '  <div class="bb-media-picker-dialog__body">' +
      '    <div class="bb-media-picker-panel" data-bb-media-panel="upload">' +
      '      <div class="bb-media-picker-drop" data-bb-media-drop>' +
      '        <p>JPEG, PNG, WebP, GIF (max 5&nbsp;MB) or PDF (max 15&nbsp;MB).</p>' +
      '        <label class="bb-media-picker-drop__label">' +
      '          <span class="material-symbols-outlined" aria-hidden="true">upload_file</span>' +
      "          Choose file" +
      '          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,.jpg,.jpeg,.png,.webp,.gif,.pdf" data-bb-media-file />' +
      "        </label>" +
      '        <p class="bb-media-picker-limits">Tenant-owned · MIME and magic-byte checks apply on the server.</p>' +
      "      </div>" +
      '      <div class="bb-media-picker-progress" data-bb-media-progress hidden>' +
      '        <div class="bb-media-picker-progress__bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-bb-media-progress-bar>' +
      '          <div class="bb-media-picker-progress__fill" data-bb-media-progress-fill></div>' +
      "        </div>" +
      '        <p class="bb-media-picker-progress__label" data-bb-media-progress-label>Uploading…</p>' +
      "      </div>" +
      '      <p class="bb-media-picker-error" data-bb-media-error hidden role="alert"></p>' +
      '      <div class="bb-media-picker-preview" data-bb-media-local-preview hidden>' +
      '        <div class="bb-media-picker-preview__frame" data-bb-media-local-frame></div>' +
      '        <p class="bb-media-picker-preview__meta" data-bb-media-local-meta></p>' +
      "      </div>" +
      "    </div>" +
      '    <div class="bb-media-picker-panel" data-bb-media-panel="library" hidden>' +
      '      <p class="bb-media-library__empty" data-bb-media-library-empty hidden>No assets yet for this visibility.</p>' +
      '      <ul class="bb-media-library" data-bb-media-library></ul>' +
      '      <div class="bb-media-picker-preview" data-bb-media-lib-preview hidden>' +
      '        <div class="bb-media-picker-preview__frame" data-bb-media-lib-frame></div>' +
      '        <p class="bb-media-picker-preview__meta" data-bb-media-lib-meta></p>' +
      "      </div>" +
      "    </div>" +
      "  </div>" +
      '  <footer class="bb-media-picker-dialog__foot">' +
      '    <button type="button" class="bb-media-picker-btn bb-media-picker-btn--ghost" data-bb-media-close>Cancel</button>' +
      '    <button type="button" class="bb-media-picker-btn bb-media-picker-btn--primary" data-bb-media-upload>Upload</button>' +
      '    <button type="button" class="bb-media-picker-btn bb-media-picker-btn--primary" data-bb-media-select hidden disabled>Use selected</button>' +
      "  </footer>" +
      "</div>";
    document.body.appendChild(dialog);

    var confirm = document.createElement("dialog");
    confirm.id = "bb-media-archive-confirm";
    confirm.className = "bb-media-confirm";
    confirm.setAttribute("data-bb-media-archive-confirm", "1");
    confirm.setAttribute("aria-labelledby", "bb-media-archive-title");
    confirm.innerHTML =
      '<div class="bb-media-confirm__body">' +
      '  <h3 id="bb-media-archive-title">Archive this asset?</h3>' +
      "  <p>The file stays in storage for audit, but it will no longer appear in the library or public delivery.</p>" +
      "</div>" +
      '<div class="bb-media-confirm__actions">' +
      '  <button type="button" class="bb-media-picker-btn bb-media-picker-btn--ghost" data-bb-media-archive-cancel>Cancel</button>' +
      '  <button type="button" class="bb-media-picker-btn bb-media-picker-btn--danger" data-bb-media-archive-confirm-btn>Archive</button>' +
      "</div>";
    document.body.appendChild(confirm);

    return dialog;
  }

  function revokeUrl(url) {
    if (url && String(url).indexOf("blob:") === 0) {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {
        /* ignore */
      }
    }
  }

  function MediaPickerController() {
    this.trigger = null;
    this.dialog = ensureDialog();
    this.confirm = document.getElementById("bb-media-archive-confirm");
    this.selected = null;
    this.localObjectUrl = null;
    this.pendingArchiveId = null;
    this.xhr = null;
    this.bindDialogOnce();
  }

  MediaPickerController.prototype.bindDialogOnce = function () {
    var self = this;
    if (this.dialog.getAttribute("data-bound") === "1") return;
    this.dialog.setAttribute("data-bound", "1");

    this.dialog.querySelectorAll("[data-bb-media-close]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        self.close();
      });
    });
    this.dialog.addEventListener("cancel", function (ev) {
      ev.preventDefault();
      self.close();
    });

    this.dialog.querySelectorAll("[data-bb-media-tab]").forEach(function (tab) {
      tab.addEventListener("click", function () {
        self.setTab(tab.getAttribute("data-bb-media-tab"));
      });
    });

    var fileInput = $("[data-bb-media-file]", this.dialog);
    var drop = $("[data-bb-media-drop]", this.dialog);
    fileInput.addEventListener("change", function () {
      self.onLocalFile(fileInput.files && fileInput.files[0]);
    });
    ["dragenter", "dragover"].forEach(function (evt) {
      drop.addEventListener(evt, function (e) {
        e.preventDefault();
        drop.classList.add("is-dragover");
      });
    });
    ["dragleave", "drop"].forEach(function (evt) {
      drop.addEventListener(evt, function (e) {
        e.preventDefault();
        drop.classList.remove("is-dragover");
      });
    });
    drop.addEventListener("drop", function (e) {
      var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) {
        fileInput.files = e.dataTransfer.files;
        self.onLocalFile(file);
      }
    });

    $("[data-bb-media-upload]", this.dialog).addEventListener("click", function () {
      self.startUpload();
    });
    $("[data-bb-media-select]", this.dialog).addEventListener("click", function () {
      self.applySelection(self.selected);
    });

    $("[data-bb-media-archive-cancel]", this.confirm).addEventListener("click", function () {
      self.pendingArchiveId = null;
      self.confirm.close();
    });
    $("[data-bb-media-archive-confirm-btn]", this.confirm).addEventListener("click", function () {
      self.confirmArchive();
    });
  };

  MediaPickerController.prototype.cfg = function () {
    var el = this.trigger;
    if (!el) return null;
    var base = String(el.getAttribute("data-media-base") || "").replace(/\/$/, "");
    return {
      uploadUrl: el.getAttribute("data-upload-url") || base + "/media/upload",
      listUrl: el.getAttribute("data-list-url") || base + "/media",
      mediaBase: base,
      targetId: el.getAttribute("data-target"),
      fill: el.getAttribute("data-fill") || "deliveryPath",
      visibility: el.getAttribute("data-visibility") || "public",
      csrf: el.getAttribute("data-csrf") || "",
    };
  };

  MediaPickerController.prototype.open = function (trigger) {
    this.trigger = trigger;
    this.selected = null;
    this.clearError();
    this.setProgress(null);
    this.setTab("upload");
    var fileInput = $("[data-bb-media-file]", this.dialog);
    if (fileInput) fileInput.value = "";
    this.onLocalFile(null);
    var cfg = this.cfg();
    var sub = $("[data-bb-media-subtitle]", this.dialog);
    if (sub && cfg) {
      sub.textContent =
        (cfg.visibility === "private" ? "Private" : "Public") +
        " · church-owned assets only · SVG not supported.";
    }
    if (typeof this.dialog.showModal === "function") {
      this.dialog.showModal();
    } else {
      this.dialog.setAttribute("open", "open");
    }
    this.loadLibrary();
  };

  MediaPickerController.prototype.close = function () {
    if (this.xhr) {
      try {
        this.xhr.abort();
      } catch (e) {
        /* ignore */
      }
      this.xhr = null;
    }
    revokeUrl(this.localObjectUrl);
    this.localObjectUrl = null;
    if (this.dialog.open) this.dialog.close();
  };

  MediaPickerController.prototype.setTab = function (name) {
    var self = this;
    this.dialog.querySelectorAll("[data-bb-media-tab]").forEach(function (tab) {
      tab.setAttribute("aria-selected", tab.getAttribute("data-bb-media-tab") === name ? "true" : "false");
    });
    this.dialog.querySelectorAll("[data-bb-media-panel]").forEach(function (panel) {
      panel.hidden = panel.getAttribute("data-bb-media-panel") !== name;
    });
    var uploadBtn = $("[data-bb-media-upload]", this.dialog);
    var selectBtn = $("[data-bb-media-select]", this.dialog);
    uploadBtn.hidden = name !== "upload";
    selectBtn.hidden = name !== "library";
    selectBtn.disabled = !self.selected;
    if (name === "library") this.loadLibrary();
  };

  MediaPickerController.prototype.clearError = function () {
    var el = $("[data-bb-media-error]", this.dialog);
    if (!el) return;
    el.hidden = true;
    el.textContent = "";
    el.classList.remove("bb-media-picker-error--cleanup");
  };

  MediaPickerController.prototype.showError = function (message, cleanup) {
    var el = $("[data-bb-media-error]", this.dialog);
    if (!el) return;
    el.hidden = false;
    el.textContent = message;
    el.classList.toggle("bb-media-picker-error--cleanup", Boolean(cleanup));
  };

  MediaPickerController.prototype.setProgress = function (pct, label) {
    var wrap = $("[data-bb-media-progress]", this.dialog);
    var fill = $("[data-bb-media-progress-fill]", this.dialog);
    var bar = $("[data-bb-media-progress-bar]", this.dialog);
    var lab = $("[data-bb-media-progress-label]", this.dialog);
    if (!wrap) return;
    if (pct == null) {
      wrap.hidden = true;
      if (fill) fill.style.width = "0%";
      return;
    }
    wrap.hidden = false;
    var n = Math.max(0, Math.min(100, Number(pct) || 0));
    if (fill) fill.style.width = n + "%";
    if (bar) bar.setAttribute("aria-valuenow", String(Math.round(n)));
    if (lab) lab.textContent = label || "Uploading… " + Math.round(n) + "%";
  };

  MediaPickerController.prototype.onLocalFile = function (file) {
    revokeUrl(this.localObjectUrl);
    this.localObjectUrl = null;
    this.clearError();
    var preview = $("[data-bb-media-local-preview]", this.dialog);
    var frame = $("[data-bb-media-local-frame]", this.dialog);
    var meta = $("[data-bb-media-local-meta]", this.dialog);
    if (!file) {
      if (preview) preview.hidden = true;
      if (frame) frame.innerHTML = "";
      if (meta) meta.textContent = "";
      return;
    }
    var validated = clientValidate(file);
    if (!validated.ok) {
      this.showError(reasonMessage(validated.reason));
      if (preview) preview.hidden = true;
      return;
    }
    if (preview) preview.hidden = false;
    if (frame) {
      frame.innerHTML = "";
      if (validated.category === "image") {
        var url = URL.createObjectURL(file);
        this.localObjectUrl = url;
        var img = document.createElement("img");
        img.alt = file.name || "Image preview";
        img.src = url;
        frame.appendChild(img);
      } else {
        var doc = document.createElement("div");
        doc.className = "bb-media-picker-preview__doc";
        doc.innerHTML =
          '<span class="material-symbols-outlined" aria-hidden="true">picture_as_pdf</span>' +
          "<span>PDF document</span>";
        frame.appendChild(doc);
      }
    }
    if (meta) {
      meta.innerHTML =
        "<strong>" +
        escapeHtml(file.name || "file") +
        "</strong> · " +
        formatBytes(file.size) +
        ' · <span class="bb-media-chip bb-media-chip--' +
        (this.cfg().visibility === "private" ? "private" : "public") +
        '">' +
        (this.cfg().visibility === "private" ? "Private" : "Public") +
        "</span>";
    }
  };

  MediaPickerController.prototype.startUpload = function () {
    var self = this;
    var cfg = this.cfg();
    var fileInput = $("[data-bb-media-file]", this.dialog);
    var file = fileInput && fileInput.files && fileInput.files[0];
    var validated = clientValidate(file);
    this.clearError();
    if (!validated.ok) {
      this.showError(reasonMessage(validated.reason));
      return;
    }
    var fd = new FormData();
    fd.append("file", file);
    fd.append("_csrf", cfg.csrf);
    fd.append("visibility", cfg.visibility);

    var uploadBtn = $("[data-bb-media-upload]", this.dialog);
    uploadBtn.disabled = true;
    this.setProgress(0, "Uploading… 0%");

    var xhr = new XMLHttpRequest();
    this.xhr = xhr;
    xhr.open("POST", cfg.uploadUrl, true);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Accept", "application/json");
    xhr.setRequestHeader("X-CSRF-Token", cfg.csrf);
    xhr.upload.onprogress = function (ev) {
      if (!ev.lengthComputable) {
        self.setProgress(50, "Uploading…");
        return;
      }
      var pct = (ev.loaded / ev.total) * 100;
      self.setProgress(pct);
    };
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      uploadBtn.disabled = false;
      self.xhr = null;
      var body = null;
      try {
        body = JSON.parse(xhr.responseText || "{}");
      } catch (e) {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && body && body.ok) {
        self.setProgress(100, body.deduped ? "Reused existing file." : "Uploaded.");
        self.applySelection({
          assetId: body.assetId,
          deliveryPath: body.deliveryPath,
          mimeType: body.mimeType,
          originalFilename: body.originalFilename || (file && file.name) || "",
          visibility: body.visibility || cfg.visibility,
          sizeBytes: body.sizeBytes,
          previewPath: cfg.mediaBase + "/media/" + body.assetId,
          category: String(body.mimeType || "").indexOf("image/") === 0 ? "image" : "document",
        });
        return;
      }
      self.setProgress(null);
      var cleanup = body && body.cleanup === "removed";
      self.showError(reasonMessage(body && body.reason, body && body.cleanup), cleanup);
    };
    xhr.onerror = function () {
      uploadBtn.disabled = false;
      self.xhr = null;
      self.setProgress(null);
      self.showError("Upload failed. Check your connection and try again.");
    };
    xhr.send(fd);
  };

  MediaPickerController.prototype.loadLibrary = function () {
    var self = this;
    var cfg = this.cfg();
    if (!cfg) return;
    var list = $("[data-bb-media-library]", this.dialog);
    var empty = $("[data-bb-media-library-empty]", this.dialog);
    list.innerHTML = "";
    empty.hidden = true;
    var url = cfg.listUrl + "?visibility=" + encodeURIComponent(cfg.visibility) + "&limit=50";
    fetch(url, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
      .then(function (res) {
        return res.json().then(function (body) {
          return { res: res, body: body };
        });
      })
      .then(function (pack) {
        if (!pack.res.ok || !pack.body || !pack.body.ok) {
          empty.hidden = false;
          empty.textContent = "Could not load the media library.";
          return;
        }
        var assets = pack.body.assets || [];
        if (!assets.length) {
          empty.hidden = false;
          empty.textContent = "No assets yet for this visibility.";
          return;
        }
        assets.forEach(function (asset) {
          list.appendChild(self.renderLibraryItem(asset));
        });
      })
      .catch(function () {
        empty.hidden = false;
        empty.textContent = "Could not load the media library.";
      });
  };

  MediaPickerController.prototype.renderLibraryItem = function (asset) {
    var self = this;
    var li = document.createElement("li");
    li.className = "bb-media-library__item";
    li.setAttribute("data-bb-asset-id", asset.id);
    if (this.selected && this.selected.assetId === asset.id) {
      li.classList.add("is-selected");
    }

    var thumb;
    if (asset.category === "image") {
      thumb = document.createElement("img");
      thumb.className = "bb-media-library__thumb";
      thumb.alt = "";
      thumb.loading = "lazy";
      thumb.src = asset.previewPath || asset.deliveryPath;
    } else {
      thumb = document.createElement("div");
      thumb.className = "bb-media-library__thumb bb-media-library__thumb--doc";
      thumb.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">picture_as_pdf</span>';
    }

    var main = document.createElement("div");
    main.innerHTML =
      '<p class="bb-media-library__name"></p><p class="bb-media-library__meta"></p>';
    main.querySelector(".bb-media-library__name").textContent = asset.originalFilename || asset.id;
    main.querySelector(".bb-media-library__meta").innerHTML =
      formatBytes(asset.sizeBytes) +
      ' · <span class="bb-media-chip bb-media-chip--' +
      (asset.visibility === "private" ? "private" : "public") +
      '">' +
      (asset.visibility === "private" ? "Private" : "Public") +
      "</span>";

    var actions = document.createElement("div");
    actions.className = "bb-media-library__actions";
    var archiveBtn = document.createElement("button");
    archiveBtn.type = "button";
    archiveBtn.textContent = "Archive";
    archiveBtn.addEventListener("click", function (ev) {
      ev.stopPropagation();
      self.askArchive(asset.id);
    });
    actions.appendChild(archiveBtn);

    li.appendChild(thumb);
    li.appendChild(main);
    li.appendChild(actions);
    li.addEventListener("click", function () {
      self.pickLibraryAsset(asset);
    });
    return li;
  };

  MediaPickerController.prototype.pickLibraryAsset = function (asset) {
    this.selected = {
      assetId: asset.id,
      deliveryPath: asset.deliveryPath,
      mimeType: asset.mimeType,
      originalFilename: asset.originalFilename,
      visibility: asset.visibility,
      sizeBytes: asset.sizeBytes,
      previewPath: asset.previewPath,
      category: asset.category,
    };
    this.dialog.querySelectorAll(".bb-media-library__item").forEach(function (el) {
      el.classList.toggle("is-selected", el.getAttribute("data-bb-asset-id") === asset.id);
    });
    var selectBtn = $("[data-bb-media-select]", this.dialog);
    selectBtn.disabled = false;
    this.renderLibPreview(this.selected);
  };

  MediaPickerController.prototype.renderLibPreview = function (asset) {
    var preview = $("[data-bb-media-lib-preview]", this.dialog);
    var frame = $("[data-bb-media-lib-frame]", this.dialog);
    var meta = $("[data-bb-media-lib-meta]", this.dialog);
    if (!preview || !frame) return;
    preview.hidden = false;
    frame.innerHTML = "";
    if (asset.category === "image") {
      var img = document.createElement("img");
      img.alt = asset.originalFilename || "Selected image";
      img.src = asset.previewPath || asset.deliveryPath;
      frame.appendChild(img);
    } else {
      var doc = document.createElement("div");
      doc.className = "bb-media-picker-preview__doc";
      doc.innerHTML =
        '<span class="material-symbols-outlined" aria-hidden="true">picture_as_pdf</span>' +
        "<span>" +
        escapeHtml(asset.originalFilename || "PDF document") +
        "</span>" +
        (asset.previewPath
          ? '<a href="' +
            escapeAttr(asset.previewPath) +
            '" target="_blank" rel="noopener">Open preview</a>'
          : "");
      frame.appendChild(doc);
    }
    if (meta) {
      meta.innerHTML =
        formatBytes(asset.sizeBytes) +
        ' · <span class="bb-media-chip bb-media-chip--' +
        (asset.visibility === "private" ? "private" : "public") +
        '">' +
        (asset.visibility === "private" ? "Private" : "Public") +
        "</span>";
    }
  };

  MediaPickerController.prototype.applySelection = function (asset) {
    if (!asset || !this.trigger) return;
    var cfg = this.cfg();
    var target = document.getElementById(cfg.targetId);
    if (!target) return;
    if (cfg.fill === "assetId") {
      target.value = asset.assetId || "";
    } else {
      target.value = asset.deliveryPath || "";
    }
    target.dispatchEvent(new Event("change", { bubbles: true }));
    var summary = this.trigger.querySelector("[data-bb-media-summary]");
    if (summary) {
      summary.innerHTML =
        "<strong>" +
        escapeHtml(asset.originalFilename || asset.assetId || "Selected") +
        "</strong> · " +
        '<span class="bb-media-chip bb-media-chip--' +
        (asset.visibility === "private" ? "private" : "public") +
        '">' +
        (asset.visibility === "private" ? "Private" : "Public") +
        "</span>";
    }
    this.close();
  };

  MediaPickerController.prototype.askArchive = function (assetId) {
    this.pendingArchiveId = assetId;
    if (typeof this.confirm.showModal === "function") {
      this.confirm.showModal();
    } else {
      this.confirm.setAttribute("open", "open");
    }
  };

  MediaPickerController.prototype.confirmArchive = function () {
    var self = this;
    var cfg = this.cfg();
    var assetId = this.pendingArchiveId;
    this.pendingArchiveId = null;
    this.confirm.close();
    if (!assetId || !cfg) return;
    fetch(cfg.mediaBase + "/media/" + encodeURIComponent(assetId) + "/archive", {
      method: "POST",
      body: "_csrf=" + encodeURIComponent(cfg.csrf),
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "X-CSRF-Token": cfg.csrf,
      },
    })
      .then(function (res) {
        return res.json().then(function (body) {
          return { res: res, body: body };
        });
      })
      .then(function (pack) {
        if (!pack.res.ok || !pack.body || !pack.body.ok) {
          self.showError(reasonMessage((pack.body && pack.body.reason) || "archive_failed"));
          self.setTab("library");
          return;
        }
        if (self.selected && self.selected.assetId === assetId) {
          self.selected = null;
          $("[data-bb-media-select]", self.dialog).disabled = true;
          var preview = $("[data-bb-media-lib-preview]", self.dialog);
          if (preview) preview.hidden = true;
        }
        self.loadLibrary();
      })
      .catch(function () {
        self.showError(reasonMessage("archive_failed"));
      });
  };

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/'/g, "&#39;");
  }

  var controller = null;

  function bindTriggers(root) {
    var nodes = (root || document).querySelectorAll("[data-bb-media-picker]");
    nodes.forEach(function (el) {
      if (el.getAttribute("data-bound") === "1") return;
      el.setAttribute("data-bound", "1");
      var btn = el.querySelector("[data-bb-media-open]");
      if (!btn) return;
      btn.addEventListener("click", function () {
        if (!controller) controller = new MediaPickerController();
        controller.open(el);
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      bindTriggers(document);
    });
  } else {
    bindTriggers(document);
  }

  window.BlessBoardMediaPicker = { bind: bindTriggers };
})();

/**
 * BlessBoard V5 shared media picker + upload dialog.
 * Uses existing content-admin media endpoints only — no storage credentials.
 * Visual/a11y chrome aligned to Shared UI States (STITCH_MISSING dedicated pair).
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
    size_limit: "File exceeds the allowed size limit (images 5 MB, PDFs 15 MB).",
    empty_file: "Choose a non-empty file.",
    unsupported_mime: "This file type is not allowed. Use JPEG, PNG, WebP, GIF, or PDF.",
    rejected_mime: "This file type is not allowed. Use JPEG, PNG, WebP, GIF, or PDF.",
    mime_rejected: "This file type is not allowed. Use JPEG, PNG, WebP, GIF, or PDF.",
    mime_not_allowed: "This file type is not allowed. Use JPEG, PNG, WebP, GIF, or PDF.",
    mime_mismatch: "The file contents do not match the declared type.",
    extension_mismatch: "The file extension does not match an allowed type.",
    signature_unrecognized: "This file type could not be verified. Use JPEG, PNG, WebP, GIF, or PDF.",
    unsafe_filename: "That filename is not allowed. Rename the file and try again.",
    svg_rejected: "SVG files are not supported.",
    csrf: "Your session expired. Refresh the page and try again.",
    upload_failed: "Upload failed. Temporary storage was cleaned up. Please try again.",
    upload_error: "Upload failed before it could finish. Please try again.",
    ownership: "This file could not be saved for this church.",
    key_exists: "A conflicting file already exists. Try again.",
    lookup: "Media library is temporarily unavailable.",
    not_found: "That media asset was not found.",
    archive_failed: "Archive failed.",
    ids: "Archive failed.",
  };

  var FOCUSABLE_SEL =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function dsApi() {
    return window.BlessBoardDesignSystem || null;
  }

  function focusable(root) {
    var api = dsApi();
    if (api && typeof api.focusable === "function") return api.focusable(root);
    if (!root) return [];
    return Array.prototype.slice.call(root.querySelectorAll(FOCUSABLE_SEL)).filter(function (el) {
      if (el.disabled || el.getAttribute("aria-hidden") === "true") return false;
      if (el.closest("[hidden]")) return false;
      return true;
    });
  }

  function trapTabKey(ev, root) {
    var api = dsApi();
    if (api && typeof api.trapTabKey === "function") {
      api.trapTabKey(ev, root);
      return;
    }
    if (!ev || ev.key !== "Tab" || !root) return;
    var nodes = focusable(root);
    if (!nodes.length) return;
    var first = nodes[0];
    var last = nodes[nodes.length - 1];
    if (ev.shiftKey && document.activeElement === first) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && document.activeElement === last) {
      ev.preventDefault();
      first.focus();
    }
  }

  function formatBytes(n) {
    var v = Number(n) || 0;
    if (v < 1024) return v + " B";
    if (v < 1024 * 1024) return (v / 1024).toFixed(1) + " KB";
    return (v / (1024 * 1024)).toFixed(1) + " MB";
  }

  function formatCreatedAt(value) {
    if (!value) return "—";
    var d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    try {
      return d.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return String(value);
    }
  }

  function reasonMessage(reason, cleanup) {
    var key = String(reason || "").trim();
    if (key === "upload_failed" || cleanup === "removed") {
      return REASON_MESSAGES.upload_failed;
    }
    if (REASON_MESSAGES[key]) return REASON_MESSAGES[key];
    return "Upload failed. Please try again.";
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
    dialog.className = "bb-media-picker-dialog bb-ds-modal__panel";
    dialog.setAttribute("data-bb-media-picker-dialog", "1");
    dialog.setAttribute("data-bb-stitch-media", "shared-ui-states");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "bb-media-picker-title");
    dialog.innerHTML =
      '<div class="bb-media-picker-dialog__frame">' +
      '  <header class="bb-media-picker-dialog__head">' +
      "    <div>" +
      '      <h2 id="bb-media-picker-title" class="bb-ds-modal__title">Media library</h2>' +
      '      <p id="bb-media-picker-desc" class="bb-ds-modal__body" data-bb-media-subtitle>Select a church-owned asset. SVG is not allowed.</p>' +
      "    </div>" +
      '    <button type="button" class="bb-media-picker-dialog__close" data-bb-media-close aria-label="Close media library">' +
      '      <span class="material-symbols-outlined" aria-hidden="true">close</span>' +
      "    </button>" +
      "  </header>" +
      '  <div class="bb-media-picker-tabs" role="tablist" aria-label="Media panels">' +
      '    <button type="button" role="tab" id="bb-media-tab-library" data-bb-media-tab="library" aria-controls="bb-media-panel-library" aria-selected="true">Library</button>' +
      '    <button type="button" role="tab" id="bb-media-tab-upload" data-bb-media-tab="upload" aria-controls="bb-media-panel-upload" aria-selected="false" tabindex="-1">Upload</button>' +
      "  </div>" +
      '  <div class="bb-media-picker-dialog__body">' +
      '    <div class="bb-media-picker-panel" id="bb-media-panel-library" role="tabpanel" aria-labelledby="bb-media-tab-library" data-bb-media-panel="library">' +
      '      <div class="bb-media-library__toolbar" data-bb-media-library-toolbar>' +
      '        <label class="bb-media-library__search">' +
      '          <span class="bb-media-library__sr">Search by filename</span>' +
      '          <input type="search" data-bb-media-library-q placeholder="Search by filename" autocomplete="off" />' +
      "        </label>" +
      '        <div class="bb-media-library__filters" role="group" aria-label="Filter by type">' +
      '          <button type="button" class="bb-media-library__filter" data-bb-media-filter="all" aria-pressed="true">All</button>' +
      '          <button type="button" class="bb-media-library__filter" data-bb-media-filter="image" aria-pressed="false">Images</button>' +
      '          <button type="button" class="bb-media-library__filter" data-bb-media-filter="document" aria-pressed="false">Documents</button>' +
      "        </div>" +
      "      </div>" +
      '      <div class="bb-media-library__layout">' +
      '        <div class="bb-media-library__main-col">' +
      '          <div class="bb-media-library__loading" data-bb-media-library-loading hidden role="status">' +
      '            <span class="bb-media-library__spinner" aria-hidden="true"></span>' +
      "            <span>Loading library…</span>" +
      "          </div>" +
      '          <div class="bb-media-library__empty" data-bb-media-library-empty hidden role="status">' +
      '            <span class="material-symbols-outlined bb-media-library__empty-icon" aria-hidden="true">photo_library</span>' +
      '            <p class="bb-media-library__empty-title" data-bb-media-library-empty-title>No assets yet</p>' +
      '            <p class="bb-media-library__empty-body" data-bb-media-library-empty-body>No church-owned files for this visibility.</p>' +
      "          </div>" +
      '          <ul class="bb-media-library bb-media-library--grid" data-bb-media-library role="listbox" aria-label="Church media assets" aria-multiselectable="false"></ul>' +
      "        </div>" +
      '        <aside class="bb-media-detail" data-bb-media-lib-preview hidden aria-live="polite" data-bb-media-detail="1">' +
      '          <p class="bb-media-picker-preview__label">Asset detail</p>' +
      '          <div class="bb-media-picker-preview__frame" data-bb-media-lib-frame></div>' +
      '          <dl class="bb-media-detail__meta" data-bb-media-lib-meta></dl>' +
      '          <p class="bb-media-detail__usage" data-bb-media-detail-usage>' +
      "            Soft-archive removes this from the library and public delivery. The stored object is retained for audit." +
      "          </p>" +
      '          <div class="bb-media-detail__actions">' +
      '            <button type="button" class="bb-media-picker-btn bb-media-picker-btn--ghost bb-media-detail__archive" data-bb-media-detail-archive>Archive…</button>' +
      "          </div>" +
      "        </aside>" +
      "      </div>" +
      "    </div>" +
      '    <div class="bb-media-picker-panel" id="bb-media-panel-upload" role="tabpanel" aria-labelledby="bb-media-tab-upload" data-bb-media-panel="upload" hidden>' +
      '      <div class="bb-media-picker-drop" data-bb-media-drop data-bb-media-drop-state="idle">' +
      '        <span class="bb-media-picker-drop__icon material-symbols-outlined" aria-hidden="true">cloud_upload</span>' +
      '        <p class="bb-media-picker-drop__title">Upload a church-owned file</p>' +
      '        <p class="bb-media-picker-drop__hint">Drag and drop here, or choose a file. JPEG, PNG, WebP, GIF (max 5&nbsp;MB) or PDF (max 15&nbsp;MB).</p>' +
      '        <ul class="bb-media-picker-drop__types" aria-label="Accepted file types">' +
      "          <li>JPEG / PNG / WebP / GIF · 5 MB</li>" +
      "          <li>PDF · 15 MB</li>" +
      "          <li>SVG not allowed</li>" +
      "        </ul>" +
      '        <label class="bb-media-picker-drop__label bb-media-picker-btn bb-media-picker-btn--ghost">' +
      '          <span class="material-symbols-outlined" aria-hidden="true">upload_file</span>' +
      "          Choose file" +
      '          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,.jpg,.jpeg,.png,.webp,.gif,.pdf" data-bb-media-file />' +
      "        </label>" +
      '        <p class="bb-media-picker-limits">Tenant-scoped · server MIME and magic-byte checks apply.</p>' +
      "      </div>" +
      '      <div class="bb-media-picker-file" data-bb-media-file-chip hidden>' +
      '        <span class="material-symbols-outlined" aria-hidden="true" data-bb-media-file-icon>draft</span>' +
      '        <div class="bb-media-picker-file__text">' +
      '          <p class="bb-media-picker-file__name" data-bb-media-file-name></p>' +
      '          <p class="bb-media-picker-file__meta" data-bb-media-file-meta></p>' +
      "        </div>" +
      '        <button type="button" class="bb-media-picker-file__clear" data-bb-media-file-clear aria-label="Clear selected file">Clear</button>' +
      "      </div>" +
      '      <div class="bb-media-picker-progress" data-bb-media-progress hidden>' +
      '        <div class="bb-media-picker-progress__bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="Upload progress" data-bb-media-progress-bar>' +
      '          <div class="bb-media-picker-progress__fill" data-bb-media-progress-fill></div>' +
      "        </div>" +
      '        <p class="bb-media-picker-progress__label" data-bb-media-progress-label>Uploading…</p>' +
      "      </div>" +
      '      <div class="bb-media-picker-success" data-bb-media-success hidden role="status">' +
      '        <span class="material-symbols-outlined" aria-hidden="true">check_circle</span>' +
      '        <p data-bb-media-success-text>Uploaded successfully.</p>' +
      "      </div>" +
      '      <div class="bb-media-picker-error" data-bb-media-error hidden role="alert" aria-live="assertive">' +
      '        <span class="material-symbols-outlined" aria-hidden="true">error</span>' +
      '        <p data-bb-media-error-text></p>' +
      "      </div>" +
      '      <div class="bb-media-picker-preview" data-bb-media-local-preview hidden>' +
      '        <p class="bb-media-picker-preview__label">Local preview</p>' +
      '        <div class="bb-media-picker-preview__frame" data-bb-media-local-frame></div>' +
      '        <p class="bb-media-picker-preview__meta" data-bb-media-local-meta></p>' +
      "      </div>" +
      "    </div>" +
      "  </div>" +
      '  <footer class="bb-media-picker-dialog__foot bb-ds-modal__actions">' +
      '    <button type="button" class="bb-media-picker-btn bb-media-picker-btn--ghost" data-bb-media-close>Cancel</button>' +
      '    <button type="button" class="bb-media-picker-btn bb-media-picker-btn--primary" data-bb-media-upload hidden disabled>Upload</button>' +
      '    <button type="button" class="bb-media-picker-btn bb-media-picker-btn--primary" data-bb-media-select disabled>Use selected</button>' +
      "  </footer>" +
      "</div>";
    dialog.setAttribute("aria-describedby", "bb-media-picker-desc");
    document.body.appendChild(dialog);

    var confirm = document.createElement("dialog");
    confirm.id = "bb-media-archive-confirm";
    confirm.className = "bb-media-confirm bb-ds-modal__panel";
    confirm.setAttribute("data-bb-media-archive-confirm", "1");
    confirm.setAttribute("role", "dialog");
    confirm.setAttribute("aria-modal", "true");
    confirm.setAttribute("aria-labelledby", "bb-media-archive-title");
    confirm.setAttribute("aria-describedby", "bb-media-archive-desc");
    confirm.innerHTML =
      '<div class="bb-media-confirm__body">' +
      '  <h3 id="bb-media-archive-title" class="bb-ds-modal__title">Archive this asset?</h3>' +
      '  <p class="bb-media-confirm__filename" data-bb-media-archive-name></p>' +
      '  <div id="bb-media-archive-desc" class="bb-media-confirm__warnings">' +
      '    <p class="bb-ds-modal__body">This soft-archives the asset for <strong>this church only</strong>.</p>' +
      "    <ul class=\"bb-media-confirm__list\">" +
      "      <li>It will no longer appear in the media library.</li>" +
      "      <li>Public delivery for this asset will stop.</li>" +
      "      <li>The file object stays in storage for audit (not permanently deleted).</li>" +
      "    </ul>" +
      '    <p class="bb-media-confirm__note" data-bb-media-archive-note>Reference checks beyond soft-archive are not reported by this release.</p>' +
      "  </div>" +
      '  <p class="bb-media-confirm__error" data-bb-media-archive-error hidden role="alert"></p>' +
      "</div>" +
      '<div class="bb-media-confirm__actions bb-ds-modal__actions">' +
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
    this.returnFocusEl = null;
    this.dialog = ensureDialog();
    this.confirm = document.getElementById("bb-media-archive-confirm");
    this.selected = null;
    this.localObjectUrl = null;
    this.pendingArchiveId = null;
    this.xhr = null;
    this.libraryAssets = [];
    this.libraryFilter = "all";
    this.libraryQuery = "";
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
    this.dialog.addEventListener("keydown", function (ev) {
      self.onDialogKeydown(ev, self.dialog);
    });

    this.dialog.querySelectorAll("[data-bb-media-tab]").forEach(function (tab) {
      tab.addEventListener("click", function () {
        self.setTab(tab.getAttribute("data-bb-media-tab"));
      });
      tab.addEventListener("keydown", function (ev) {
        self.onTabKeydown(ev, tab);
      });
    });

    var search = $("[data-bb-media-library-q]", this.dialog);
    if (search) {
      search.addEventListener("input", function () {
        self.libraryQuery = String(search.value || "").trim().toLowerCase();
        self.renderLibraryList();
      });
    }
    this.dialog.querySelectorAll("[data-bb-media-filter]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        self.libraryFilter = btn.getAttribute("data-bb-media-filter") || "all";
        self.dialog.querySelectorAll("[data-bb-media-filter]").forEach(function (el) {
          var on = el.getAttribute("data-bb-media-filter") === self.libraryFilter;
          el.setAttribute("aria-pressed", on ? "true" : "false");
        });
        self.renderLibraryList();
      });
    });

    var list = $("[data-bb-media-library]", this.dialog);
    if (list) {
      list.addEventListener("keydown", function (ev) {
        self.onLibraryKeydown(ev);
      });
    }

    var fileInput = $("[data-bb-media-file]", this.dialog);
    var drop = $("[data-bb-media-drop]", this.dialog);
    fileInput.addEventListener("change", function () {
      self.onLocalFile(fileInput.files && fileInput.files[0]);
    });
    ["dragenter", "dragover"].forEach(function (evt) {
      drop.addEventListener(evt, function (e) {
        e.preventDefault();
        self.setDropState("dragover");
      });
    });
    ["dragleave", "drop"].forEach(function (evt) {
      drop.addEventListener(evt, function (e) {
        e.preventDefault();
        var fileInputEl = $("[data-bb-media-file]", self.dialog);
        var hasFile = fileInputEl && fileInputEl.files && fileInputEl.files[0];
        self.setDropState(hasFile ? "ready" : "idle");
      });
    });
    drop.addEventListener("drop", function (e) {
      var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) {
        try {
          fileInput.files = e.dataTransfer.files;
        } catch (err) {
          /* some browsers block assigning FileList */
        }
        self.onLocalFile(file);
      }
    });

    $("[data-bb-media-upload]", this.dialog).addEventListener("click", function () {
      self.startUpload();
    });
    $("[data-bb-media-select]", this.dialog).addEventListener("click", function () {
      self.applySelection(self.selected);
    });
    var clearBtn = $("[data-bb-media-file-clear]", this.dialog);
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        self.clearLocalFile();
      });
    }

    $("[data-bb-media-archive-cancel]", this.confirm).addEventListener("click", function () {
      self.closeConfirm();
    });
    $("[data-bb-media-archive-confirm-btn]", this.confirm).addEventListener("click", function () {
      self.confirmArchive();
    });
    var detailArchive = $("[data-bb-media-detail-archive]", this.dialog);
    if (detailArchive) {
      detailArchive.addEventListener("click", function () {
        if (self.selected && self.selected.assetId) {
          self.askArchive(self.selected.assetId);
        }
      });
    }
    this.confirm.addEventListener("cancel", function (ev) {
      ev.preventDefault();
      self.closeConfirm();
    });
    this.confirm.addEventListener("keydown", function (ev) {
      self.onDialogKeydown(ev, self.confirm);
    });
  };

  MediaPickerController.prototype.onDialogKeydown = function (ev, root) {
    trapTabKey(ev, root);
  };

  MediaPickerController.prototype.onTabKeydown = function (ev, tab) {
    var tabs = Array.prototype.slice.call(this.dialog.querySelectorAll("[data-bb-media-tab]"));
    if (!tabs.length) return;
    var idx = tabs.indexOf(tab);
    var next = -1;
    if (ev.key === "ArrowRight" || ev.key === "ArrowDown") {
      next = (idx + 1) % tabs.length;
    } else if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") {
      next = (idx - 1 + tabs.length) % tabs.length;
    } else if (ev.key === "Home") {
      next = 0;
    } else if (ev.key === "End") {
      next = tabs.length - 1;
    } else {
      return;
    }
    ev.preventDefault();
    var target = tabs[next];
    this.setTab(target.getAttribute("data-bb-media-tab"));
    target.focus();
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
    this.returnFocusEl = trigger.querySelector("[data-bb-media-open]") || trigger;
    this.selected = null;
    this.libraryFilter = "all";
    this.libraryQuery = "";
    this.clearError();
    this.setProgress(null);
    var search = $("[data-bb-media-library-q]", this.dialog);
    if (search) search.value = "";
    this.dialog.querySelectorAll("[data-bb-media-filter]").forEach(function (el) {
      var on = el.getAttribute("data-bb-media-filter") === "all";
      el.setAttribute("aria-pressed", on ? "true" : "false");
    });
    this.setTab("library");
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
    this.dialog.classList.toggle(
      "bb-media-picker-dialog--drawer",
      typeof window.matchMedia === "function" && window.matchMedia("(max-width: 767px)").matches
    );
    if (typeof this.dialog.showModal === "function") {
      this.dialog.showModal();
    } else {
      this.dialog.setAttribute("open", "open");
    }
    var closeBtn = $("[data-bb-media-close]", this.dialog);
    if (closeBtn) {
      try {
        closeBtn.focus();
      } catch (e) {
        /* ignore */
      }
    }
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
    if (this.confirm && this.confirm.open) this.closeConfirm(true);
    if (this.dialog.open) this.dialog.close();
    var ret = this.returnFocusEl;
    this.returnFocusEl = null;
    if (ret) {
      try {
        ret.focus();
      } catch (e) {
        /* ignore */
      }
    }
  };

  MediaPickerController.prototype.closeConfirm = function (skipFocus) {
    this.pendingArchiveId = null;
    if (this.confirm && this.confirm.open) this.confirm.close();
    if (!skipFocus) {
      var selectBtn = $("[data-bb-media-select]", this.dialog);
      var archiveBtns = this.dialog.querySelectorAll(".bb-media-library__actions button");
      var focusTarget =
        (selectBtn && !selectBtn.hidden && !selectBtn.disabled && selectBtn) ||
        (archiveBtns && archiveBtns[0]) ||
        $("[data-bb-media-close]", this.dialog);
      if (focusTarget) {
        try {
          focusTarget.focus();
        } catch (e) {
          /* ignore */
        }
      }
    }
  };

  MediaPickerController.prototype.setTab = function (name) {
    var self = this;
    this.dialog.querySelectorAll("[data-bb-media-tab]").forEach(function (tab) {
      var selected = tab.getAttribute("data-bb-media-tab") === name;
      tab.setAttribute("aria-selected", selected ? "true" : "false");
      tab.setAttribute("tabindex", selected ? "0" : "-1");
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
    var text = $("[data-bb-media-error-text]", this.dialog);
    if (!el) return;
    el.hidden = true;
    if (text) text.textContent = "";
    else el.textContent = "";
    el.classList.remove("bb-media-picker-error--cleanup");
  };

  MediaPickerController.prototype.showError = function (message, cleanup) {
    var el = $("[data-bb-media-error]", this.dialog);
    var text = $("[data-bb-media-error-text]", this.dialog);
    var success = $("[data-bb-media-success]", this.dialog);
    if (success) success.hidden = true;
    if (!el) return;
    el.hidden = false;
    if (text) text.textContent = message;
    else el.textContent = message;
    el.classList.toggle("bb-media-picker-error--cleanup", Boolean(cleanup));
    this.setDropState("error");
  };

  MediaPickerController.prototype.showSuccess = function (message) {
    var el = $("[data-bb-media-success]", this.dialog);
    var text = $("[data-bb-media-success-text]", this.dialog);
    this.clearError();
    if (!el) return;
    el.hidden = false;
    if (text) text.textContent = message || "Uploaded successfully.";
    this.setDropState("success");
  };

  MediaPickerController.prototype.setDropState = function (state) {
    var drop = $("[data-bb-media-drop]", this.dialog);
    var panel = $('[data-bb-media-panel="upload"]', this.dialog);
    if (!drop) return;
    drop.setAttribute("data-bb-media-drop-state", state || "idle");
    drop.classList.toggle("is-dragover", state === "dragover");
    drop.classList.toggle("is-ready", state === "ready");
    drop.classList.toggle("is-uploading", state === "uploading");
    drop.classList.toggle("is-success", state === "success");
    drop.classList.toggle("is-error", state === "error");
    if (panel) {
      if (state === "uploading") panel.setAttribute("aria-busy", "true");
      else panel.removeAttribute("aria-busy");
    }
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

  MediaPickerController.prototype.clearLocalFile = function () {
    var fileInput = $("[data-bb-media-file]", this.dialog);
    if (fileInput) fileInput.value = "";
    this.onLocalFile(null);
    this.setDropState("idle");
    var uploadBtn = $("[data-bb-media-upload]", this.dialog);
    if (uploadBtn) uploadBtn.disabled = true;
  };

  MediaPickerController.prototype.onLocalFile = function (file) {
    revokeUrl(this.localObjectUrl);
    this.localObjectUrl = null;
    this.clearError();
    var success = $("[data-bb-media-success]", this.dialog);
    if (success) success.hidden = true;
    var preview = $("[data-bb-media-local-preview]", this.dialog);
    var frame = $("[data-bb-media-local-frame]", this.dialog);
    var meta = $("[data-bb-media-local-meta]", this.dialog);
    var chip = $("[data-bb-media-file-chip]", this.dialog);
    var chipName = $("[data-bb-media-file-name]", this.dialog);
    var chipMeta = $("[data-bb-media-file-meta]", this.dialog);
    var chipIcon = $("[data-bb-media-file-icon]", this.dialog);
    var uploadBtn = $("[data-bb-media-upload]", this.dialog);
    this.setProgress(null);

    if (!file) {
      if (preview) preview.hidden = true;
      if (frame) frame.innerHTML = "";
      if (meta) meta.textContent = "";
      if (chip) chip.hidden = true;
      if (uploadBtn) uploadBtn.disabled = true;
      this.setDropState("idle");
      return;
    }

    var validated = clientValidate(file);
    if (!validated.ok) {
      this.showError(reasonMessage(validated.reason));
      if (preview) preview.hidden = true;
      if (chip) chip.hidden = true;
      if (uploadBtn) uploadBtn.disabled = true;
      return;
    }

    this.setDropState("ready");
    if (uploadBtn) uploadBtn.disabled = false;
    if (chip) {
      chip.hidden = false;
      if (chipName) chipName.textContent = file.name || "file";
      if (chipMeta) {
        chipMeta.textContent =
          formatBytes(file.size) +
          " · " +
          (validated.category === "image" ? "Image" : "PDF") +
          " · " +
          (this.cfg().visibility === "private" ? "Private" : "Public");
      }
      if (chipIcon) {
        chipIcon.textContent = validated.category === "image" ? "image" : "picture_as_pdf";
      }
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
    var success = $("[data-bb-media-success]", this.dialog);
    if (success) success.hidden = true;
    if (!validated.ok) {
      this.showError(reasonMessage(validated.reason));
      return;
    }
    var fd = new FormData();
    fd.append("file", file);
    fd.append("_csrf", cfg.csrf);
    fd.append("visibility", cfg.visibility);

    var uploadBtn = $("[data-bb-media-upload]", this.dialog);
    var clearBtn = $("[data-bb-media-file-clear]", this.dialog);
    uploadBtn.disabled = true;
    if (clearBtn) clearBtn.disabled = true;
    this.setDropState("uploading");
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
      if (clearBtn) clearBtn.disabled = false;
      self.xhr = null;
      var body = null;
      try {
        body = JSON.parse(xhr.responseText || "{}");
      } catch (e) {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && body && body.ok) {
        var okMsg = body.deduped ? "Reused existing file." : "Uploaded successfully.";
        self.setProgress(100, okMsg);
        self.showSuccess(okMsg);
        var selection = {
          assetId: body.assetId,
          deliveryPath: body.deliveryPath,
          mimeType: body.mimeType,
          originalFilename: body.originalFilename || (file && file.name) || "",
          visibility: body.visibility || cfg.visibility,
          sizeBytes: body.sizeBytes,
          previewPath: cfg.mediaBase + "/media/" + body.assetId,
          category: String(body.mimeType || "").indexOf("image/") === 0 ? "image" : "document",
        };
        window.setTimeout(function () {
          self.applySelection(selection);
        }, 450);
        return;
      }
      self.setProgress(null);
      var cleanup = body && body.cleanup === "removed";
      self.showError(reasonMessage(body && body.reason, body && body.cleanup), cleanup);
    };
    xhr.onerror = function () {
      uploadBtn.disabled = false;
      if (clearBtn) clearBtn.disabled = false;
      self.xhr = null;
      self.setProgress(null);
      self.showError("Upload failed. Check your connection and try again.");
    };
    xhr.send(fd);
  };

  MediaPickerController.prototype.setLibraryStatus = function (state, title, body) {
    var loading = $("[data-bb-media-library-loading]", this.dialog);
    var empty = $("[data-bb-media-library-empty]", this.dialog);
    var list = $("[data-bb-media-library]", this.dialog);
    var toolbar = $("[data-bb-media-library-toolbar]", this.dialog);
    var titleEl = $("[data-bb-media-library-empty-title]", this.dialog);
    var bodyEl = $("[data-bb-media-library-empty-body]", this.dialog);
    if (loading) loading.hidden = state !== "loading";
    if (empty) empty.hidden = state !== "empty" && state !== "error" && state !== "no-results";
    if (list) list.hidden = state !== "list";
    if (toolbar) toolbar.hidden = state === "loading";
    if (state === "empty" || state === "error" || state === "no-results") {
      if (titleEl) {
        titleEl.textContent =
          title ||
          (state === "no-results" ? "No matching assets" : state === "error" ? "Library unavailable" : "No assets yet");
      }
      if (bodyEl) {
        bodyEl.textContent =
          body ||
          (state === "error"
            ? "Try again in a moment."
            : state === "no-results"
              ? "Try a different filename or type filter."
              : "No church-owned files for this visibility.");
      }
    }
  };

  MediaPickerController.prototype.filteredLibraryAssets = function () {
    var q = this.libraryQuery;
    var filter = this.libraryFilter;
    return (this.libraryAssets || []).filter(function (asset) {
      if (!asset) return false;
      if (filter === "image" && asset.category !== "image") return false;
      if (filter === "document" && asset.category !== "document") return false;
      if (q) {
        var name = String(asset.originalFilename || "").toLowerCase();
        if (name.indexOf(q) === -1) return false;
      }
      return true;
    });
  };

  MediaPickerController.prototype.renderLibraryList = function () {
    var self = this;
    var list = $("[data-bb-media-library]", this.dialog);
    if (!list) return;
    list.innerHTML = "";
    if (!this.libraryAssets.length) {
      this.setLibraryStatus(
        "empty",
        "No assets yet",
        "No church-owned files for this visibility."
      );
      var previewEmpty = $("[data-bb-media-lib-preview]", this.dialog);
      if (previewEmpty) previewEmpty.hidden = true;
      return;
    }
    var assets = this.filteredLibraryAssets();
    if (!assets.length) {
      this.setLibraryStatus(
        "no-results",
        "No matching assets",
        "Try a different filename or type filter."
      );
      return;
    }
    this.setLibraryStatus("list");
    assets.forEach(function (asset) {
      list.appendChild(self.renderLibraryItem(asset));
    });
    list.setAttribute("tabindex", "0");
    this.restoreSelectionFromTarget(assets);
  };

  MediaPickerController.prototype.restoreSelectionFromTarget = function (assets) {
    var cfg = this.cfg();
    if (!cfg || !cfg.targetId) return;
    var target = document.getElementById(cfg.targetId);
    if (!target || !target.value) return;
    var value = String(target.value);
    var match = (assets || []).find(function (a) {
      if (cfg.fill === "assetId") return a.id === value;
      return a.deliveryPath === value || a.id === value;
    });
    if (match) this.pickLibraryAsset(match);
  };

  MediaPickerController.prototype.loadLibrary = function () {
    var self = this;
    var cfg = this.cfg();
    if (!cfg) return;
    var list = $("[data-bb-media-library]", this.dialog);
    list.innerHTML = "";
    this.libraryAssets = [];
    this.setLibraryStatus("loading");
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
          self.setLibraryStatus(
            "error",
            "Could not load the media library",
            "Check your connection and try again."
          );
          return;
        }
        self.libraryAssets = pack.body.assets || [];
        self.renderLibraryList();
      })
      .catch(function () {
        self.setLibraryStatus(
          "error",
          "Could not load the media library",
          "Check your connection and try again."
        );
      });
  };

  MediaPickerController.prototype.renderLibraryItem = function (asset) {
    var self = this;
    var li = document.createElement("li");
    li.className = "bb-media-library__item";
    li.id = "bb-media-asset-" + asset.id;
    li.setAttribute("data-bb-asset-id", asset.id);
    li.setAttribute("role", "option");
    li.setAttribute("tabindex", "-1");
    li.setAttribute("aria-selected", this.selected && this.selected.assetId === asset.id ? "true" : "false");
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
    main.className = "bb-media-library__main";
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
    archiveBtn.className = "bb-media-library__archive";
    archiveBtn.setAttribute("aria-label", "Archive " + (asset.originalFilename || "asset"));
    archiveBtn.setAttribute("tabindex", "-1");
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
    li.addEventListener("dblclick", function () {
      self.pickLibraryAsset(asset);
      self.applySelection(self.selected);
    });
    li.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        self.pickLibraryAsset(asset);
        if (ev.key === "Enter") self.applySelection(self.selected);
      }
    });
    return li;
  };

  MediaPickerController.prototype.onLibraryKeydown = function (ev) {
    var items = Array.prototype.slice.call(
      this.dialog.querySelectorAll(".bb-media-library__item:not([hidden])")
    );
    if (!items.length) return;
    var current = document.activeElement;
    var idx = items.indexOf(current);
    if (idx < 0 && this.selected) {
      for (var i = 0; i < items.length; i++) {
        if (items[i].getAttribute("data-bb-asset-id") === this.selected.assetId) {
          idx = i;
          break;
        }
      }
    }
    var cols = window.matchMedia && window.matchMedia("(min-width: 700px)").matches ? 3 : 2;
    var next = idx;
    if (ev.key === "ArrowRight") next = Math.min(items.length - 1, (idx < 0 ? 0 : idx) + 1);
    else if (ev.key === "ArrowLeft") next = Math.max(0, (idx < 0 ? 0 : idx) - 1);
    else if (ev.key === "ArrowDown") next = Math.min(items.length - 1, (idx < 0 ? 0 : idx) + cols);
    else if (ev.key === "ArrowUp") next = Math.max(0, (idx < 0 ? 0 : idx) - cols);
    else if (ev.key === "Home") next = 0;
    else if (ev.key === "End") next = items.length - 1;
    else return;
    ev.preventDefault();
    items[next].focus();
    var id = items[next].getAttribute("data-bb-asset-id");
    var asset = (this.libraryAssets || []).find(function (a) {
      return a.id === id;
    });
    if (asset) this.pickLibraryAsset(asset);
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
      createdAt: asset.createdAt || null,
    };
    var list = $("[data-bb-media-library]", this.dialog);
    if (list) list.setAttribute("aria-activedescendant", "bb-media-asset-" + asset.id);
    this.dialog.querySelectorAll(".bb-media-library__item").forEach(function (el) {
      var selected = el.getAttribute("data-bb-asset-id") === asset.id;
      el.classList.toggle("is-selected", selected);
      el.setAttribute("aria-selected", selected ? "true" : "false");
      el.setAttribute("tabindex", selected ? "0" : "-1");
    });
    var selectBtn = $("[data-bb-media-select]", this.dialog);
    selectBtn.disabled = false;
    this.renderLibPreview(this.selected);
  };

  MediaPickerController.prototype.renderLibPreview = function (asset) {
    var preview = $("[data-bb-media-lib-preview]", this.dialog);
    var frame = $("[data-bb-media-lib-frame]", this.dialog);
    var meta = $("[data-bb-media-lib-meta]", this.dialog);
    var archiveBtn = $("[data-bb-media-detail-archive]", this.dialog);
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
      var delivery = asset.deliveryPath || "";
      // Safe app delivery path only — never storage keys/buckets.
      meta.innerHTML =
        "<div><dt>Filename</dt><dd>" +
        escapeHtml(asset.originalFilename || "—") +
        "</dd></div>" +
        "<div><dt>Type</dt><dd>" +
        escapeHtml(asset.mimeType || asset.category || "—") +
        "</dd></div>" +
        "<div><dt>Size</dt><dd>" +
        escapeHtml(formatBytes(asset.sizeBytes)) +
        "</dd></div>" +
        "<div><dt>Visibility</dt><dd><span class=\"bb-media-chip bb-media-chip--" +
        (asset.visibility === "private" ? "private" : "public") +
        '">' +
        (asset.visibility === "private" ? "Private" : "Public") +
        "</span></dd></div>" +
        "<div><dt>Added</dt><dd>" +
        escapeHtml(formatCreatedAt(asset.createdAt)) +
        "</dd></div>" +
        "<div><dt>Delivery</dt><dd><code class=\"bb-media-detail__path\">" +
        escapeHtml(delivery || "—") +
        "</code></dd></div>";
    }
    if (archiveBtn) {
      archiveBtn.disabled = !asset.assetId;
      archiveBtn.setAttribute(
        "aria-label",
        "Archive " + (asset.originalFilename || "selected asset")
      );
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
    var id = String(assetId || "");
    this.pendingArchiveId = id;
    var asset =
      (this.libraryAssets || []).find(function (a) {
        return a.id === id;
      }) ||
      (this.selected && this.selected.assetId === id ? this.selected : null);
    var nameEl = $("[data-bb-media-archive-name]", this.confirm);
    var errEl = $("[data-bb-media-archive-error]", this.confirm);
    var confirmBtn = $("[data-bb-media-archive-confirm-btn]", this.confirm);
    if (nameEl) {
      nameEl.textContent =
        (asset && (asset.originalFilename || asset.id)) || "Selected asset";
    }
    if (errEl) {
      errEl.hidden = true;
      errEl.textContent = "";
    }
    if (confirmBtn) confirmBtn.disabled = false;
    if (typeof this.confirm.showModal === "function") {
      this.confirm.showModal();
    } else {
      this.confirm.setAttribute("open", "open");
    }
    var cancelBtn = $("[data-bb-media-archive-cancel]", this.confirm);
    if (cancelBtn) {
      try {
        cancelBtn.focus();
      } catch (e) {
        /* ignore */
      }
    }
  };

  MediaPickerController.prototype.confirmArchive = function () {
    var self = this;
    var cfg = this.cfg();
    var assetId = this.pendingArchiveId;
    var confirmBtn = $("[data-bb-media-archive-confirm-btn]", this.confirm);
    var errEl = $("[data-bb-media-archive-error]", this.confirm);
    if (!assetId || !cfg) {
      this.closeConfirm();
      return;
    }
    if (confirmBtn) confirmBtn.disabled = true;
    if (errEl) {
      errEl.hidden = true;
      errEl.textContent = "";
    }
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
          var msg = reasonMessage((pack.body && pack.body.reason) || "archive_failed");
          if (errEl) {
            errEl.hidden = false;
            errEl.textContent = msg;
          }
          if (confirmBtn) confirmBtn.disabled = false;
          return;
        }
        self.pendingArchiveId = null;
        if (self.confirm.open) self.confirm.close();
        if (self.selected && self.selected.assetId === assetId) {
          self.selected = null;
          $("[data-bb-media-select]", self.dialog).disabled = true;
          var preview = $("[data-bb-media-lib-preview]", self.dialog);
          if (preview) preview.hidden = true;
        }
        self.loadLibrary();
      })
      .catch(function () {
        if (errEl) {
          errEl.hidden = false;
          errEl.textContent = reasonMessage("archive_failed");
        }
        if (confirmBtn) confirmBtn.disabled = false;
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

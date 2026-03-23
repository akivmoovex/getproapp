(function () {
  var W = window.__WORKSPACE__;
  if (!W || !W.paths) return;

  var M3_CLOSE_MS = 280;

  var mode = "saved";
  var savedState = {
    company: JSON.parse(JSON.stringify(W.company)),
    galleryAdminText: W.galleryAdminText || "",
  };
  var draft = clone(savedState);

  var els = {
    iframe: document.querySelector("[data-ws-iframe]"),
    previewWrap: document.querySelector("[data-ws-preview-wrap]"),
    editPanel: document.querySelector("[data-ws-edit-panel]"),
    btnEdit: document.querySelector("[data-ws-edit]"),
    btnPreview: document.querySelector("[data-ws-preview]"),
    btnClose: document.querySelector("[data-ws-close]"),
    btnPublish: document.querySelector("[data-ws-publish]"),
    btnBackEdit: document.querySelector("[data-ws-back-edit]"),
    dialog: document.querySelector("[data-ws-dialog]"),
    dialogCancel: document.querySelector("[data-ws-dialog-cancel]"),
    dialogLeave: document.querySelector("[data-ws-dialog-leave]"),
    overlay: document.querySelector("[data-ws-overlay]"),
  };

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function openM3Modal(el) {
    if (!el) return;
    el.removeAttribute("hidden");
    el.setAttribute("aria-hidden", "false");
    void el.offsetWidth;
    el.classList.add("m3-modal-overlay--open");
  }

  function closeM3Modal(el) {
    if (!el) return;
    el.classList.remove("m3-modal-overlay--open");
    window.setTimeout(function () {
      if (!el.classList.contains("m3-modal-overlay--open")) {
        el.setAttribute("hidden", "hidden");
        el.setAttribute("aria-hidden", "true");
      }
    }, M3_CLOSE_MS);
  }

  function applyStateToForm(st) {
    var c = st.company;
    document.querySelectorAll("[data-f]").forEach(function (inp) {
      var key = inp.getAttribute("data-f");
      if (key === "gallery_text") {
        inp.value = st.galleryAdminText || "";
        return;
      }
      if (key === "category_id") {
        inp.value = c.category_id != null && c.category_id !== "" ? String(c.category_id) : "";
        return;
      }
      if (key === "years_experience") {
        inp.value =
          c.years_experience != null && c.years_experience !== "" ? String(c.years_experience) : "";
        return;
      }
      var v = c[key];
      inp.value = v != null ? String(v) : "";
    });
  }

  function collectFormState() {
    var c = {};
    document.querySelectorAll("[data-f]").forEach(function (inp) {
      var key = inp.getAttribute("data-f");
      if (key === "gallery_text") return;
      if (key === "category_id") {
        var cv = inp.value.trim();
        c.category_id = cv === "" ? "" : cv;
        return;
      }
      if (key === "years_experience") {
        var y = inp.value.trim();
        c.years_experience = y === "" ? "" : y;
        return;
      }
      c[key] = inp.value;
    });
    var galleryText = document.querySelector('[data-f="gallery_text"]');
    return {
      company: c,
      galleryAdminText: galleryText ? galleryText.value : "",
    };
  }

  function mergeDraftForApi(st) {
    var c = Object.assign({}, st.company);
    return {
      company: Object.assign({}, c, { gallery_text: st.galleryAdminText }),
    };
  }

  function setVis(el, hidden) {
    if (!el) return;
    el.classList.toggle("u-hidden", !!hidden);
  }

  function setToolbar() {
    var isSaved = mode === "saved";
    var isEdit = mode === "edit";
    var isDraft = mode === "draftPreview";
    setVis(els.btnEdit, !isSaved);
    setVis(els.btnPreview, !isEdit);
    setVis(els.btnClose, !isEdit);
    setVis(els.btnPublish, !isDraft);
    setVis(els.btnBackEdit, !isDraft);
  }

  function showSavedPreview() {
    mode = "saved";
    draft = clone(savedState);
    if (els.previewWrap) els.previewWrap.classList.remove("u-hidden");
    if (els.editPanel) els.editPanel.setAttribute("hidden", "hidden");
    if (els.iframe) {
      els.iframe.removeAttribute("srcdoc");
      els.iframe.src = W.paths.previewFrame + "?t=" + Date.now();
    }
    setToolbar();
  }

  function showEdit() {
    mode = "edit";
    if (els.previewWrap) els.previewWrap.classList.add("u-hidden");
    if (els.editPanel) els.editPanel.removeAttribute("hidden");
    applyStateToForm(draft);
    setToolbar();
  }

  function showDraftPreview(html) {
    mode = "draftPreview";
    if (els.previewWrap) els.previewWrap.classList.remove("u-hidden");
    if (els.editPanel) els.editPanel.setAttribute("hidden", "hidden");
    if (els.iframe) {
      els.iframe.src = "about:blank";
      els.iframe.srcdoc = html;
    }
    setToolbar();
  }

  if (els.btnEdit) {
    els.btnEdit.addEventListener("click", function () {
      draft = clone(savedState);
      showEdit();
    });
  }

  if (els.btnPreview) {
    els.btnPreview.addEventListener("click", function () {
      draft = collectFormState();
      var payload = mergeDraftForApi(draft);
      fetch(W.paths.previewDraft, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/html" },
        body: JSON.stringify(payload),
        credentials: "same-origin",
      })
        .then(function (r) {
          if (!r.ok) throw new Error("Preview failed");
          return r.text();
        })
        .then(function (html) {
          showDraftPreview(html);
        })
        .catch(function () {
          alert("Could not build preview. Check your data and try again.");
        });
    });
  }

  if (els.btnClose) {
    els.btnClose.addEventListener("click", function () {
      openM3Modal(els.dialog);
    });
  }

  function closeLeaveModal() {
    closeM3Modal(els.dialog);
  }

  if (els.dialogCancel) {
    els.dialogCancel.addEventListener("click", function () {
      closeLeaveModal();
    });
  }

  document.querySelectorAll("[data-ws-dialog-dismiss]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      closeLeaveModal();
    });
  });

  if (els.dialogLeave) {
    els.dialogLeave.addEventListener("click", function () {
      closeLeaveModal();
      draft = clone(savedState);
      showSavedPreview();
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || !els.dialog || els.dialog.hasAttribute("hidden")) return;
    if (!els.dialog.classList.contains("m3-modal-overlay--open")) return;
    closeLeaveModal();
  });

  if (els.btnBackEdit) {
    els.btnBackEdit.addEventListener("click", function () {
      showEdit();
    });
  }

  if (els.btnPublish) {
    els.btnPublish.addEventListener("click", function () {
      var payload = mergeDraftForApi(draft);
      if (els.overlay) {
        els.overlay.removeAttribute("hidden");
        els.overlay.setAttribute("aria-hidden", "false");
        els.overlay.setAttribute("aria-busy", "true");
        void els.overlay.offsetWidth;
        els.overlay.classList.add("m3-modal-overlay--open");
      }
      fetch(W.paths.publish, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
        credentials: "same-origin",
      })
        .then(function (r) {
          return r.json().then(function (j) {
            if (!r.ok) throw new Error((j && j.error) || "Publish failed");
            return j;
          });
        })
        .then(function (j) {
          if (!j || !j.company) throw new Error("Invalid response");
          savedState.company = {
            id: j.company.id,
            name: j.company.name,
            subdomain: j.company.subdomain,
            category_id: j.company.category_id,
            headline: j.company.headline,
            about: j.company.about,
            services: j.company.services,
            phone: j.company.phone,
            email: j.company.email,
            location: j.company.location,
            years_experience: j.company.years_experience,
            service_areas: j.company.service_areas,
            hours_text: j.company.hours_text,
            featured_cta_label: j.company.featured_cta_label,
            featured_cta_phone: j.company.featured_cta_phone,
            logo_url: j.company.logo_url,
          };
          savedState.galleryAdminText = j.galleryAdminText || "";
          draft = clone(savedState);
          if (els.overlay) {
            els.overlay.classList.remove("m3-modal-overlay--open");
            els.overlay.removeAttribute("aria-busy");
            window.setTimeout(function () {
              if (els.overlay && !els.overlay.classList.contains("m3-modal-overlay--open")) {
                els.overlay.setAttribute("hidden", "hidden");
                els.overlay.setAttribute("aria-hidden", "true");
              }
            }, M3_CLOSE_MS);
          }
          showSavedPreview();
        })
        .catch(function (e) {
          if (els.overlay) {
            els.overlay.classList.remove("m3-modal-overlay--open");
            els.overlay.removeAttribute("aria-busy");
            window.setTimeout(function () {
              if (els.overlay && !els.overlay.classList.contains("m3-modal-overlay--open")) {
                els.overlay.setAttribute("hidden", "hidden");
                els.overlay.setAttribute("aria-hidden", "true");
              }
            }, M3_CLOSE_MS);
          }
          alert(e.message || "Publish failed");
        });
    });
  }

  applyStateToForm(savedState);
  setToolbar();
})();

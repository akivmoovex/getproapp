(function () {
  var W = window.__WORKSPACE__;
  if (!W || !W.paths) return;

  var mode = "saved";
  var savedState = {
    company: JSON.parse(JSON.stringify(W.company)),
    galleryAdminText: W.galleryAdminText || "",
    reviews: JSON.parse(JSON.stringify(W.reviews || [])),
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
    reviewsRoot: document.querySelector("[data-ws-reviews]"),
    addReview: document.querySelector("[data-ws-add-review]"),
    overlay: document.querySelector("[data-ws-overlay]"),
  };

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
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
    renderReviewRows(st.reviews);
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
      reviews: collectReviewsFromDom(),
    };
  }

  function collectReviewsFromDom() {
    var out = [];
    document.querySelectorAll("[data-ws-review-row]").forEach(function (row) {
      var id = row.getAttribute("data-review-id");
      var rating = row.querySelector("[data-review-rating]");
      var author = row.querySelector("[data-review-author]");
      var body = row.querySelector("[data-review-body]");
      var o = {
        rating: rating ? Number(rating.value) : 5,
        author_name: author ? author.value : "",
        body: body ? body.value : "",
      };
      if (id) o.id = Number(id);
      out.push(o);
    });
    return out;
  }

  function renderReviewRows(reviews) {
    if (!els.reviewsRoot) return;
    els.reviewsRoot.innerHTML = "";
    (reviews || []).forEach(function (r) {
      var row = document.createElement("div");
      row.className = "admin-workspace__review-row";
      row.setAttribute("data-ws-review-row", "");
      if (r.id) row.setAttribute("data-review-id", String(r.id));

      var grid = document.createElement("div");
      grid.className = "admin-workspace__review-grid";

      var lblR = document.createElement("label");
      lblR.appendChild(document.createTextNode("Rating "));
      var inpR = document.createElement("input");
      inpR.type = "number";
      inpR.min = "1";
      inpR.max = "5";
      inpR.step = "0.01";
      inpR.setAttribute("data-review-rating", "");
      inpR.value = r.rating != null ? String(r.rating) : "5";
      lblR.appendChild(inpR);
      grid.appendChild(lblR);

      var lblA = document.createElement("label");
      lblA.appendChild(document.createTextNode("Author "));
      var inpA = document.createElement("input");
      inpA.type = "text";
      inpA.setAttribute("data-review-author", "");
      inpA.value = r.author_name || "";
      lblA.appendChild(inpA);
      grid.appendChild(lblA);

      row.appendChild(grid);

      var lblB = document.createElement("label");
      lblB.className = "admin-workspace__review-body-label";
      lblB.appendChild(document.createTextNode("Review "));
      var ta = document.createElement("textarea");
      ta.rows = 3;
      ta.setAttribute("data-review-body", "");
      ta.value = r.body || "";
      lblB.appendChild(ta);
      row.appendChild(lblB);

      var rm = document.createElement("button");
      rm.type = "button";
      rm.className = "btn admin-workspace__review-remove";
      rm.setAttribute("data-review-remove", "");
      rm.textContent = "Remove";
      rm.addEventListener("click", function () {
        row.remove();
      });
      row.appendChild(rm);

      els.reviewsRoot.appendChild(row);
    });
  }

  function mergeDraftForApi(st) {
    var c = Object.assign({}, st.company);
    return {
      company: Object.assign({}, c, { gallery_text: st.galleryAdminText }),
      reviews: st.reviews,
    };
  }

  function setToolbar() {
    var isSaved = mode === "saved";
    var isEdit = mode === "edit";
    var isDraft = mode === "draftPreview";
    if (els.btnEdit) els.btnEdit.style.display = isSaved ? "inline-flex" : "none";
    if (els.btnPreview) els.btnPreview.style.display = isEdit ? "inline-flex" : "none";
    if (els.btnClose) els.btnClose.style.display = isEdit ? "inline-flex" : "none";
    if (els.btnPublish) els.btnPublish.style.display = isDraft ? "inline-flex" : "none";
    if (els.btnBackEdit) els.btnBackEdit.style.display = isDraft ? "inline-flex" : "none";
  }

  function showSavedPreview() {
    mode = "saved";
    draft = clone(savedState);
    if (els.previewWrap) els.previewWrap.style.display = "";
    if (els.editPanel) els.editPanel.style.display = "none";
    if (els.iframe) {
      els.iframe.removeAttribute("srcdoc");
      els.iframe.src = W.paths.previewFrame + "?t=" + Date.now();
    }
    setToolbar();
  }

  function showEdit() {
    mode = "edit";
    if (els.previewWrap) els.previewWrap.style.display = "none";
    if (els.editPanel) els.editPanel.style.display = "block";
    applyStateToForm(draft);
    setToolbar();
  }

  function showDraftPreview(html) {
    mode = "draftPreview";
    if (els.previewWrap) els.previewWrap.style.display = "";
    if (els.editPanel) els.editPanel.style.display = "none";
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
      if (els.dialog && typeof els.dialog.showModal === "function") els.dialog.showModal();
    });
  }

  if (els.dialogCancel) {
    els.dialogCancel.addEventListener("click", function () {
      if (els.dialog) els.dialog.close();
    });
  }

  if (els.dialogLeave) {
    els.dialogLeave.addEventListener("click", function () {
      if (els.dialog) els.dialog.close();
      draft = clone(savedState);
      showSavedPreview();
    });
  }

  if (els.btnBackEdit) {
    els.btnBackEdit.addEventListener("click", function () {
      showEdit();
    });
  }

  if (els.addReview) {
    els.addReview.addEventListener("click", function () {
      var cur = collectFormState();
      cur.reviews.push({ rating: 5, author_name: "", body: "" });
      draft = cur;
      renderReviewRows(cur.reviews);
      var rows = document.querySelectorAll("[data-ws-review-row]");
      var last = rows[rows.length - 1];
      if (last) {
        var ta = last.querySelector("[data-review-body]");
        if (ta) ta.focus();
      }
    });
  }

  if (els.btnPublish) {
    els.btnPublish.addEventListener("click", function () {
      var payload = mergeDraftForApi(draft);
      if (els.overlay) {
        els.overlay.hidden = false;
        els.overlay.setAttribute("aria-hidden", "false");
        els.overlay.setAttribute("aria-busy", "true");
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
          savedState.reviews = j.reviews || [];
          draft = clone(savedState);
          if (els.overlay) {
            els.overlay.hidden = true;
            els.overlay.setAttribute("aria-hidden", "true");
            els.overlay.removeAttribute("aria-busy");
          }
          showSavedPreview();
        })
        .catch(function (e) {
          if (els.overlay) {
            els.overlay.hidden = true;
            els.overlay.setAttribute("aria-hidden", "true");
            els.overlay.removeAttribute("aria-busy");
          }
          alert(e.message || "Publish failed");
        });
    });
  }

  applyStateToForm(savedState);
  setToolbar();
})();

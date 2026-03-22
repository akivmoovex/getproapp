(function () {
  var cfg = window.__CRM_KANBAN__;
  if (!cfg || !cfg.statuses) return;

  var draggingId = null;

  document.querySelectorAll(".admin-crm-card[draggable='true']").forEach(function (card) {
    var dragEndAt = 0;
    card.addEventListener("dragstart", function (e) {
      draggingId = card.getAttribute("data-task-id");
      card.classList.add("admin-crm-card--dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", draggingId || "");
    });
    card.addEventListener("dragend", function () {
      card.classList.remove("admin-crm-card--dragging");
      draggingId = null;
      dragEndAt = Date.now();
    });

    var body = card.querySelector("[data-crm-open-task]");
    if (!body) return;

    function openFromCard() {
      var id = body.getAttribute("data-crm-open-task");
      if (id) openOverlay(id);
    }

    body.addEventListener("click", function (e) {
      if (Date.now() - dragEndAt < 320) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      e.preventDefault();
      openFromCard();
    });
    body.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openFromCard();
      }
    });
  });

  document.querySelectorAll(".admin-crm-card[draggable='false'] [data-crm-open-task]").forEach(function (body) {
    function openFromCard() {
      var id = body.getAttribute("data-crm-open-task");
      if (id) openOverlay(id);
    }
    body.addEventListener("click", function (e) {
      e.preventDefault();
      openFromCard();
    });
    body.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openFromCard();
      }
    });
  });

  document.querySelectorAll("[data-crm-dropzone]").forEach(function (zone) {
    zone.addEventListener("dragover", function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      zone.classList.add("admin-crm-kanban__dropzone--dragover");
    });
    zone.addEventListener("dragleave", function (e) {
      if (!zone.contains(e.relatedTarget)) {
        zone.classList.remove("admin-crm-kanban__dropzone--dragover");
      }
    });
    zone.addEventListener("drop", function (e) {
      e.preventDefault();
      zone.classList.remove("admin-crm-kanban__dropzone--dragover");
      var id = draggingId || e.dataTransfer.getData("text/plain");
      var targetStatus = zone.getAttribute("data-crm-dropzone");
      if (!id || !targetStatus) return;

      var card = document.querySelector('.admin-crm-card[data-task-id="' + id + '"]');
      if (!card) return;
      var fromStatus = card.getAttribute("data-crm-status");
      if (fromStatus === targetStatus) return;

      fetch("/admin/crm/tasks/" + encodeURIComponent(id) + "/move", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ status: targetStatus }),
      })
        .then(function (r) {
          if (r.ok) {
            window.location.reload();
            return;
          }
          return r.json().then(function (j) {
            throw new Error((j && j.error) || r.statusText);
          });
        })
        .catch(function (err) {
          window.alert(err.message || "Could not move task");
        });
    });
  });

  var overlay = document.getElementById("crm_task_overlay");
  var overlayBody = document.getElementById("crm_task_overlay_body");

  function openOverlay(taskId) {
    if (!overlay || !overlayBody) return;
    overlayBody.innerHTML = '<p class="muted" style="padding:16px;">Loading…</p>';
    overlay.removeAttribute("hidden");
    overlay.setAttribute("aria-hidden", "false");
    overlay.classList.add("admin-crm-overlay--open");
    document.body.style.overflow = "hidden";
    fetch("/admin/crm/tasks/" + encodeURIComponent(taskId) + "/panel", {
      credentials: "same-origin",
      headers: { Accept: "text/html" },
    })
      .then(function (r) {
        if (!r.ok) throw new Error("Not found");
        return r.text();
      })
      .then(function (html) {
        overlayBody.innerHTML = html;
      })
      .catch(function () {
        overlayBody.innerHTML = '<p class="muted" style="padding:16px;">Could not load task.</p>';
      });
  }

  function closeOverlay() {
    if (!overlay) return;
    overlay.setAttribute("hidden", "hidden");
    overlay.setAttribute("aria-hidden", "true");
    overlay.classList.remove("admin-crm-overlay--open");
    document.body.style.overflow = "";
    if (overlayBody) overlayBody.innerHTML = "";
    try {
      var u = new URL(window.location.href);
      u.searchParams.delete("openTask");
      var q = u.searchParams.toString();
      window.history.replaceState({}, "", u.pathname + (q ? "?" + q : "") + u.hash);
    } catch (e) {}
  }

  document.querySelectorAll("[data-crm-close-overlay]").forEach(function (el) {
    el.addEventListener("click", function (e) {
      e.preventDefault();
      closeOverlay();
    });
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && overlay && !overlay.hasAttribute("hidden")) {
      closeOverlay();
    }
  });

  try {
    var p = new URLSearchParams(window.location.search);
    var o = p.get("openTask");
    if (o) openOverlay(o);
  } catch (e) {}

  document.querySelectorAll(".admin-crm-kanban__col-toggle").forEach(function (btn) {
    var col = btn.closest(".admin-crm-kanban__col");
    if (!col) return;
    btn.addEventListener("click", function () {
      var collapsed = col.classList.toggle("admin-crm-kanban__col--collapsed");
      btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    });
  });
})();

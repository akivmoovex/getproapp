(function () {
  var cfg = window.__CRM_KANBAN__;
  if (!cfg || !cfg.statuses) return;

  var draggingId = null;

  function findCard(el) {
    while (el && el !== document.body) {
      if (el.classList && el.classList.contains("admin-crm-card")) return el;
      el = el.parentNode;
    }
    return null;
  }

  function dropZoneFor(col) {
    return col.querySelector("[data-crm-dropzone]");
  }

  document.querySelectorAll(".admin-crm-card--draggable").forEach(function (card) {
    card.addEventListener("dragstart", function (e) {
      draggingId = card.getAttribute("data-task-id");
      card.classList.add("admin-crm-card--dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", draggingId || "");
    });
    card.addEventListener("dragend", function () {
      card.classList.remove("admin-crm-card--dragging");
      draggingId = null;
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
})();

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
    upload.addEventListener("submit", function (event) {
      if (!upload.getAttribute("data-ac-mw-ajax")) return;
      event.preventDefault();
      var body = new FormData(upload);
      if (status) status.textContent = "Uploading…";
      fetch(upload.action, {
        method: "POST",
        body: body,
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      })
        .then(function (res) { return res.json().then(function (json) { return { res: res, json: json }; }); })
        .then(function (result) {
          if (!result.json || !result.json.ok) {
            if (status) status.textContent = "Upload failed. Use JPEG, PNG, WebP, or GIF up to 5 MB.";
            return;
          }
          window.location.reload();
        })
        .catch(function () {
          if (status) status.textContent = "Upload failed. Check your connection and try again.";
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
      pickerTarget = btn.closest("form");
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
            button.innerHTML = (item.publicSrc ? "<img src=\"" + item.publicSrc + "\" alt=\"\">" : "") +
              "<span>" + (item.originalFilename || "Image") + "</span>";
            button.addEventListener("click", function () {
              if (!pickerTarget) return;
              var idInput = pickerTarget.querySelector("[data-ac-mw-media-id]");
              var srcInput = pickerTarget.querySelector("[data-ac-mw-media-src]");
              var altInput = pickerTarget.querySelector("[data-ac-mw-media-alt]");
              var preview = pickerTarget.querySelector("[data-ac-mw-media-preview]");
              if (idInput) idInput.value = item.id || "";
              if (srcInput) srcInput.value = item.publicSrc || "";
              if (altInput && !altInput.value) altInput.value = item.altText || "";
              if (preview) preview.src = item.publicSrc || preview.src;
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
})();

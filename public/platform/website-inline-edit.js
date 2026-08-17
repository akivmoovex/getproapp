(function () {
  var chrome = document.querySelector("[data-website-chrome]");
  if (!chrome) return;
  var clinicKey = chrome.getAttribute("data-clinic-key");
  var csrf = document.querySelector('meta[name="csrf-token"]');
  var csrfField = "_csrf";
  var csrfToken = csrf ? csrf.getAttribute("content") : "";

  function post(path, body) {
    var data = {};
    data[csrfField] = csrfToken;
    Object.keys(body || {}).forEach(function (k) {
      data[k] = body[k];
    });
    return fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then(function (res) {
      return res.json();
    });
  }

  document.querySelectorAll("[data-website-key]").forEach(function (el) {
    var valueEl = el.querySelector("[data-website-value]");
    var saveBtn = el.querySelector("[data-website-save]");
    var cancelBtn = el.querySelector("[data-website-cancel]");
    if (!valueEl) return;
    var original = valueEl.textContent;
    valueEl.addEventListener("click", function () {
      el.setAttribute("data-website-editing", "1");
      valueEl.setAttribute("contenteditable", "true");
      if (saveBtn) saveBtn.hidden = false;
      if (cancelBtn) cancelBtn.hidden = false;
      valueEl.focus();
    });
    if (saveBtn) {
      saveBtn.addEventListener("click", function () {
        post("/clinics/" + encodeURIComponent(clinicKey) + "/website/drafts", {
          contentKey: el.getAttribute("data-website-key"),
          value: valueEl.textContent,
        }).then(function (out) {
          if (out && out.ok) {
            original = valueEl.textContent;
            el.removeAttribute("data-website-editing");
            valueEl.removeAttribute("contenteditable");
            saveBtn.hidden = true;
            if (cancelBtn) cancelBtn.hidden = true;
          }
        });
      });
    }
    if (cancelBtn) {
      cancelBtn.addEventListener("click", function () {
        valueEl.textContent = original;
        el.removeAttribute("data-website-editing");
        valueEl.removeAttribute("contenteditable");
        saveBtn.hidden = true;
        cancelBtn.hidden = true;
        post("/clinics/" + encodeURIComponent(clinicKey) + "/website/drafts/discard", {
          contentKey: el.getAttribute("data-website-key"),
        });
      });
    }
  });
})();

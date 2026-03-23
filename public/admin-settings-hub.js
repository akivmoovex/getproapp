(function () {
  var modal = document.getElementById("admin_settings_modal");
  var iframe = document.getElementById("admin_settings_iframe");
  if (!modal || !iframe) return;

  function finishClose() {
    iframe.src = "about:blank";
    modal.setAttribute("hidden", "hidden");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function closeModal() {
    modal.classList.remove("m3-modal-overlay--open");
    var done = false;
    function onEnd(e) {
      if (e.target !== modal || e.propertyName !== "opacity") return;
      if (done) return;
      done = true;
      modal.removeEventListener("transitionend", onEnd);
      finishClose();
    }
    modal.addEventListener("transitionend", onEnd);
    window.setTimeout(function () {
      if (done) return;
      done = true;
      modal.removeEventListener("transitionend", onEnd);
      finishClose();
    }, 320);
  }

  function openModal(url) {
    modal.removeAttribute("hidden");
    modal.setAttribute("aria-hidden", "false");
    void modal.offsetWidth;
    modal.classList.add("m3-modal-overlay--open");
    iframe.src = url;
    document.body.style.overflow = "hidden";
  }

  document.querySelectorAll("[data-settings-embed-url]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var u = btn.getAttribute("data-settings-embed-url");
      if (u) openModal(u);
    });
  });

  modal.addEventListener("click", function (e) {
    if (e.target.closest(".m3-modal-overlay__backdrop") || e.target.closest("[data-settings-modal-close]")) {
      closeModal();
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !modal.hasAttribute("hidden")) closeModal();
  });
})();

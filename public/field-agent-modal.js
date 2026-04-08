(function () {
  var root = document.getElementById("wf-field-agent-modal");
  var openBtn = document.getElementById("wf-field-agent-open");
  var backdrop = document.getElementById("wf-field-agent-modal-backdrop");
  var closeX = document.getElementById("wf-field-agent-modal-x");
  var cancel = document.getElementById("wf-field-agent-cancel");
  if (!root || !openBtn) return;

  function openModal() {
    root.hidden = false;
    root.setAttribute("aria-hidden", "false");
    void root.offsetWidth;
    root.classList.add("m3-modal-overlay--open");
    document.body.classList.add("join-modal-open");
    var first = root.querySelector('input[type="text"], input:not([type])');
    if (first && typeof first.focus === "function") first.focus();
  }

  function closeModal() {
    root.classList.remove("m3-modal-overlay--open");
    document.body.classList.remove("join-modal-open");
    root.setAttribute("aria-hidden", "true");
    root.hidden = true;
  }

  openBtn.addEventListener("click", function (e) {
    e.preventDefault();
    openModal();
  });
  if (backdrop) backdrop.addEventListener("click", closeModal);
  if (closeX) closeX.addEventListener("click", closeModal);
  if (cancel) cancel.addEventListener("click", closeModal);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !root.hidden) closeModal();
  });
})();

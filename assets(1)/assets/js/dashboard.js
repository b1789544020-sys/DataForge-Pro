/* DataForge Pro — Dashboard controller
 * Renders categorized tool cards, search filtering, language switch,
 * and license activation modal.
 */
(function () {
  const t = window.DFP.t;

  /* ---------- DOM refs ---------- */
  const grid = document.getElementById("toolGrid");
  const search = document.getElementById("toolSearch");
  const licenseBadge = document.getElementById("licenseBadge");
  const licenseLink = document.getElementById("licenseLink");
  const modal = document.getElementById("licenseModal");
  const licenseInput = document.getElementById("licenseInput");
  const activateBtn = document.getElementById("activateLicense");
  const closeBtn = document.getElementById("closeLicense");
  const licenseHint = document.getElementById("licenseHint");
  const langToggle = document.getElementById("langToggle");

  /* ---------- Static text application ---------- */
  function applyStaticText() {
    document.title = t("brand.name") + " — " + t("brand.tagline");
    setText(".brand h1", null); // keep logo markup
    setText(".tagline", t("brand.tagline"));
    setText(".hero h2", t("hero.title"));
    setText(".hero p", t("hero.subtitle"));
    if (search) search.placeholder = t("search.placeholder");
    if (licenseLink) licenseLink.textContent = t("license.modal.title");

    // Modal
    setText("#licenseModal h3", t("license.modal.title"));
    setText("#licenseModal p:not(.license-hint)", t("license.modal.desc"));
    if (licenseInput) licenseInput.placeholder = t("license.input.placeholder");
    if (closeBtn) closeBtn.textContent = t("license.btn.cancel");
    if (activateBtn) activateBtn.textContent = t("license.btn.activate");

    // Footer
    setText(".footer .copyright", t("license.footer"));

    updateLicenseBadge();
    if (langToggle) langToggle.textContent = window.DFP.lang === "zh" ? "EN" : "中文";
  }

  function setText(sel, text) {
    const el = document.querySelector(sel);
    if (el && text != null) el.textContent = text;
  }

  /* ---------- License badge ---------- */
  function updateLicenseBadge() {
    if (!licenseBadge) return;
    if (window.DFPLicense.isActivated()) {
      licenseBadge.textContent = t("license.status.unlocked");
      licenseBadge.classList.add("activated");
    } else {
      licenseBadge.textContent = t("license.status.trial");
      licenseBadge.classList.remove("activated");
    }
  }

  /* ---------- Render tool grid ---------- */
  function renderTools(filter) {
    if (!grid) return;
    grid.innerHTML = "";
    const q = (filter || "").trim().toLowerCase();
    const activated = window.DFPLicense.isActivated();

    window.DFP.CATEGORIES.forEach(cat => {
      const toolsInCat = window.DFP.TOOLS.filter(tool => {
        if (tool.cat !== cat) return false;
        if (!q) return true;
        const name = t("tool." + tool.id + ".name").toLowerCase();
        const desc = t("tool." + tool.id + ".desc").toLowerCase();
        return name.includes(q) || desc.includes(q) || tool.id.includes(q);
      });
      if (!toolsInCat.length) return;

      const section = document.createElement("div");
      section.className = "cat-section";
      const heading = document.createElement("h3");
      heading.className = "cat-heading";
      heading.textContent = t("cat." + cat);
      section.appendChild(heading);

      const row = document.createElement("div");
      row.className = "cat-row";

      toolsInCat.forEach(tool => {
        const card = document.createElement("a");
        card.className = "tool-card" + (tool.pro ? " is-pro" : "");
        card.href = "tool.html?id=" + encodeURIComponent(tool.id);

        const locked = tool.pro && !activated;
        card.innerHTML = `
          <div class="tool-icon">${tool.icon}</div>
          <div class="tool-body">
            <div class="tool-name">
              ${t("tool." + tool.id + ".name")}
              ${tool.pro ? `<span class="pro-tag">${locked ? "🔒 PRO" : "PRO"}</span>` : ""}
            </div>
            <div class="tool-desc">${t("tool." + tool.id + ".desc")}</div>
          </div>`;
        row.appendChild(card);
      });

      section.appendChild(row);
      grid.appendChild(section);
    });

    if (!grid.children.length) {
      const empty = document.createElement("p");
      empty.className = "no-results";
      empty.textContent = window.DFP.lang === "zh" ? "没有找到匹配的工具" : "No matching tools found";
      grid.appendChild(empty);
    }
  }

  /* ---------- Modal control ---------- */
  function openModal() {
    if (modal) { modal.hidden = false; licenseInput.focus(); }
  }
  function closeModal() {
    if (modal) { modal.hidden = true; licenseHint.textContent = ""; }
  }
  function handleActivate() {
    const key = licenseInput.value;
    if (window.DFPLicense.activate(key)) {
      licenseHint.textContent = t("license.hint.valid");
      licenseHint.className = "license-hint ok";
      updateLicenseBadge();
      renderTools(search ? search.value : "");
      setTimeout(closeModal, 1200);
    } else {
      licenseHint.textContent = t("license.hint.invalid");
      licenseHint.className = "license-hint err";
    }
  }

  /* ---------- Events ---------- */
  if (search) search.addEventListener("input", () => renderTools(search.value));
  if (licenseLink) licenseLink.addEventListener("click", e => { e.preventDefault(); openModal(); });
  if (licenseBadge) licenseBadge.addEventListener("click", openModal);
  if (activateBtn) activateBtn.addEventListener("click", handleActivate);
  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  if (modal) modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
  if (licenseInput) licenseInput.addEventListener("keydown", e => { if (e.key === "Enter") handleActivate(); });

  if (langToggle) {
    langToggle.addEventListener("click", () => {
      window.DFP.setLang(window.DFP.lang === "zh" ? "en" : "zh");
    });
  }

  document.addEventListener("langchange", () => {
    applyStaticText();
    renderTools(search ? search.value : "");
  });

  /* ---------- Init ---------- */
  applyStaticText();
  renderTools("");
})();
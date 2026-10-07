/* DataForge — Dashboard controller
 * Renders categorized tool cards, search filtering, language switch.
 * 100% open source: no paywall, no pro badges, no license modal.
 */
(function () {
  const t = window.DFP.t;

  /* ---------- DOM refs ---------- */
  const grid = document.getElementById("toolGrid");
  const search = document.getElementById("toolSearch");
  const langToggle = document.getElementById("langToggle");

  /* ---------- Static text application ---------- */
  function applyStaticText() {
    document.title = t("brand.name") + " — " + t("brand.tagline");
    setText(".tagline", t("brand.tagline"));
    setText(".hero h2", t("hero.title"));
    setText(".hero p", t("hero.subtitle"));
    if (search) search.placeholder = t("search.placeholder");
    setText(".footer .copyright", t("footer.copyright"));
    if (langToggle) langToggle.textContent = window.DFP.lang === "zh" ? "EN" : "中文";
  }

  function setText(sel, text) {
    const el = document.querySelector(sel);
    if (el && text != null) el.textContent = text;
  }

  /* ---------- Render tool grid ---------- */
  function renderTools(filter) {
    if (!grid) return;
    grid.innerHTML = "";
    const q = (filter || "").trim().toLowerCase();

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
        card.className = "tool-card";
        card.href = "tool.html?id=" + encodeURIComponent(tool.id);

        card.innerHTML = `
          <div class="tool-icon">${tool.icon}</div>
          <div class="tool-body">
            <div class="tool-name">${t("tool." + tool.id + ".name")}</div>
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

  /* ---------- Events ---------- */
  if (search) search.addEventListener("input", () => renderTools(search.value));

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
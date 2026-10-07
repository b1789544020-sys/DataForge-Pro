/* DataForge — AI settings panel (shared by index.html and tool.html)
 * Injects the 🤖 AI button into the topbar and a modal for provider config.
 * Nothing here fires a network request until the user clicks "Test".
 */
(function () {
  "use strict";
  var t = function (k) { return window.DFP.t(k); };

  var AMP = String.fromCharCode(38);
  function esc(s) {
    return String(s == null ? "" : s)
      .split(AMP).join(AMP + "amp;")
      .split("<").join(AMP + "lt;")
      .split('"').join(AMP + "quot;");
  }

  var overlay, statusEl;

  function badgeText() {
    var cfg = window.DFPAI.getConfig();
    if (!cfg.enabled) return t("ai.badge.off");
    if (!window.DFPAI.isConfigured()) return t("ai.badge.incomplete");
    return window.DFPAI.isLocalEndpoint(cfg.baseUrl) ? t("ai.badge.local") : t("ai.badge.on");
  }

  function refreshBadge() {
    var b = document.getElementById("aiSettingsBtn");
    if (b) b.textContent = "🤖 " + badgeText();
    document.dispatchEvent(new CustomEvent("ai-config-change"));
  }

  function status(msg, kind) {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.className = "license-hint" + (kind ? " " + kind : "");
  }

  function open() { buildModal(); overlay.hidden = false; status(""); }

  function close() { if (overlay) overlay.hidden = true; }

  function buildModal() {
    if (document.getElementById("aiModal")) { overlay = document.getElementById("aiModal"); return; }
    var cfg = window.DFPAI.getConfig();
    overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "aiModal";
    overlay.hidden = true;
    overlay.innerHTML =
      '<div class="modal ai-modal">' +
        '<h3>🤖 ' + esc(t("ai.settings.title")) + '</h3>' +
        '<p class="ai-note">' + esc(t("ai.settings.desc")) + '</p>' +
        '<label class="opt-check ai-enable"><input type="checkbox" id="aiEnabled"' + (cfg.enabled ? " checked" : "") + '>' +
          '<span>' + esc(t("ai.settings.enable")) + '</span></label>' +
        '<div class="ai-presets">' +
          '<span>' + esc(t("ai.settings.preset")) + '</span>' +
          '<button class="btn-ghost" data-preset="ollama">Ollama</button>' +
          '<button class="btn-ghost" data-preset="lmstudio">LM Studio</button>' +
          '<button class="btn-ghost" data-preset="openai">OpenAI</button>' +
          '<button class="btn-ghost" data-preset="deepseek">DeepSeek</button>' +
        '</div>' +
        '<label class="opt-field"><span>' + esc(t("ai.settings.baseUrl")) + '</span>' +
          '<input type="text" id="aiBaseUrl" value="' + esc(cfg.baseUrl) + '" placeholder="http://localhost:11434/v1"></label>' +
        '<label class="opt-field"><span>' + esc(t("ai.settings.apiKey")) + '</span>' +
          '<input type="password" id="aiApiKey" value="' + esc(cfg.apiKey) + '" placeholder="' + esc(t("ai.settings.apiKey.ph")) + '"></label>' +
        '<label class="opt-field"><span>' + esc(t("ai.settings.model")) + '</span>' +
          '<input type="text" id="aiModel" value="' + esc(cfg.model) + '" placeholder="gpt-4o-mini"></label>' +
        '<div class="ai-row">' +
          '<label class="opt-field"><span>' + esc(t("ai.settings.maxRows")) + '</span>' +
            '<input type="number" id="aiMaxRows" min="1" max="200" value="' + cfg.maxRows + '"></label>' +
          '<label class="opt-field"><span>' + esc(t("ai.settings.maxChars")) + '</span>' +
            '<input type="number" id="aiMaxChars" min="100" max="20000" step="100" value="' + cfg.maxChars + '"></label>' +
        '</div>' +
        '<label class="opt-check"><input type="checkbox" id="aiMask"' + (cfg.mask ? " checked" : "") + '>' +
          '<span>' + esc(t("ai.settings.mask")) + '</span></label>' +
        '<p class="ai-privacy">' + esc(t("ai.settings.privacy")) + '</p>' +
        '<p class="license-hint" id="aiStatus"></p>' +
        '<div class="modal-actions">' +
          '<button class="btn-ghost" id="aiTest">' + esc(t("ai.settings.test")) + '</button>' +
          '<button class="btn-secondary" id="aiCancel">' + esc(t("ai.settings.cancel")) + '</button>' +
          '<button class="btn-primary" id="aiSave">' + esc(t("ai.settings.save")) + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    statusEl = overlay.querySelector("#aiStatus");

    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
    overlay.querySelector("#aiCancel").addEventListener("click", close);
    overlay.querySelector("#aiSave").addEventListener("click", save);
    overlay.querySelector("#aiTest").addEventListener("click", test);
    Array.prototype.forEach.call(overlay.querySelectorAll("[data-preset]"), function (btn) {
      btn.addEventListener("click", function () {
        var p = window.DFPAI.PRESETS[btn.getAttribute("data-preset")];
        overlay.querySelector("#aiBaseUrl").value = p.baseUrl;
        overlay.querySelector("#aiModel").value = p.model;
        overlay.querySelector("#aiEnabled").checked = true;
        status("");
      });
    });
  }

  function readForm() {
    return {
      enabled: overlay.querySelector("#aiEnabled").checked,
      baseUrl: overlay.querySelector("#aiBaseUrl").value.trim(),
      apiKey: overlay.querySelector("#aiApiKey").value.trim(),
      model: overlay.querySelector("#aiModel").value.trim(),
      maxRows: parseInt(overlay.querySelector("#aiMaxRows").value, 10) || 20,
      maxChars: parseInt(overlay.querySelector("#aiMaxChars").value, 10) || 2000,
      mask: overlay.querySelector("#aiMask").checked
    };
  }

  function save() {
    window.DFPAI.setConfig(readForm());
    refreshBadge();
    status(t("ai.settings.saved"), "ok");
    setTimeout(close, 700);
  }

  function test() {
    window.DFPAI.setConfig(readForm());
    refreshBadge();
    if (!window.DFPAI.isConfigured()) { status(t("ai.err.notConfigured"), "bad"); return; }
    status(t("ai.settings.testing"));
    window.DFPAI.testConnection().then(function (reply) {
      status(t("ai.settings.testOk") + " " + reply, "ok");
    }, function (err) {
      status(t("ai.settings.testFail") + " " + err.message, "bad");
    });
  }

  /* ------------------------------------------------------------ topbar button */
  function mountButton() {
    var host = document.querySelector(".topbar-actions");
    if (!host || document.getElementById("aiSettingsBtn")) return;
    var btn = document.createElement("button");
    btn.className = "lang-toggle ai-btn";
    btn.id = "aiSettingsBtn";
    btn.title = t("ai.settings.title");
    btn.addEventListener("click", open);
    host.insertBefore(btn, host.firstChild);
    refreshBadge();
  }

  document.addEventListener("langchange", function () {
    if (overlay) { overlay.remove(); overlay = null; statusEl = null; }
    var btn = document.getElementById("aiSettingsBtn");
    if (btn) btn.title = t("ai.settings.title");
    refreshBadge();
  });

  mountButton();
  window.DFPAIPanel = { open: open, close: close, refreshBadge: refreshBadge, badgeText: badgeText };
})();

/* DataForge — AI tool finder for the homepage (index.html)
 * Describe a task in one sentence, get the matching tools.
 * Works offline with keyword rules; uses the model only when configured.
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

  var host = document.getElementById("aiFinder");
  if (!host) return;

  function toast(msg) {
    var el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    setTimeout(function () { el.classList.remove("show"); }, 1600);
  }

  function render() {
    host.innerHTML =
      '<div class="ai-finder-head">' +
        '<span class="ai-finder-title">🤖 ' + esc(t("ai.finder.title")) + '</span>' +
        '<span class="ai-bar-mode" id="aiFinderMode"></span>' +
      '</div>' +
      '<p class="ai-finder-sub">' + esc(t("ai.finder.sub")) + '</p>' +
      '<div class="ai-finder-row">' +
        '<input type="text" id="aiTask" placeholder="' + esc(t("ai.finder.placeholder")) + '">' +
        '<button class="btn-primary" id="aiFindBtn">' + esc(t("ai.finder.go")) + '</button>' +
      '</div>' +
      '<div class="ai-out" id="aiFinderOut" hidden></div>';

    document.getElementById("aiFindBtn").addEventListener("click", find);
    document.getElementById("aiTask").addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); find(); }
    });
    refreshMode();
  }

  function refreshMode() {
    var el = document.getElementById("aiFinderMode");
    if (!el) return;
    var on = window.DFPAI.isConfigured();
    el.textContent = on ? t("ai.mode.model") : t("ai.mode.offline");
    el.className = "ai-bar-mode " + (on ? "on" : "off");
  }

  function out(html, kind) {
    var el = document.getElementById("aiFinderOut");
    el.hidden = false;
    el.className = "ai-out" + (kind ? " " + kind : "");
    el.innerHTML = html;
  }

  function find() {
    var q = document.getElementById("aiTask").value.trim();
    if (!q) { toast(t("ai.err.noPrompt")); return; }
    if (window.DFPAI.isConfigured() && !window.DFPAI.hasConsent()) {
      if (!window.confirm(t("ai.consent"))) return;
      window.DFPAI.grantConsent();
    }
    out('<p class="ai-busy">' + esc(t("ai.finder.busy")) + '</p>');
    window.DFPAssist.recommend(q).then(function (res) {
      if (!res.picks.length) {
        out('<p>' + esc(t("ai.finder.none")) + '</p>', "warn");
        return;
      }
      var html = '<p class="ai-out-title">' + esc(t("ai.finder.result")) + '</p><ul class="ai-picks">';
      res.picks.forEach(function (p) {
        var tool = window.DFP.getTool(p.id);
        var href = "tool.html?id=" + encodeURIComponent(p.id) + "&task=" + encodeURIComponent(q);
        html += '<li><a class="ai-pick" href="' + href + '">' +
                '<span class="ai-pick-icon">' + tool.icon + '</span>' +
                '<span class="ai-pick-body">' +
                  '<b>' + esc(t("tool." + p.id + ".name")) + '</b>' +
                  '<em>' + esc(p.why || t("tool." + p.id + ".desc")) + '</em>' +
                '</span></a></li>';
      });
      html += "</ul>";
      if (res.fallbackError) {
        html += '<p class="ai-warn">⚠ ' + esc(t("ai.err.fallback")) + " " + esc(res.fallbackError) + '</p>';
      }
      out(html);
    }, function (err) {
      out('<p class="ai-warn">⚠ ' + esc(err.message) + '</p>', "warn");
    });
  }

  document.addEventListener("langchange", render);
  document.addEventListener("ai-config-change", refreshMode);
  render();
})();

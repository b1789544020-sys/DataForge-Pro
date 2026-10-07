/* DataForge — AI copilot bar for the workbench (tool.html)
 * Adds three helpers above the Options panel:
 *   🪄 configure options from a plain sentence  (suggestion -> preview -> apply)
 *   🔍 diagnose the pasted data and recommend settings
 *   💡 explain the produced output
 * The deterministic engine still performs every transformation; AI only proposes
 * option values, which the user must apply explicitly.
 */
window.DFPCopilot = (function () {
  "use strict";
  var t = function (k) { return window.DFP.t(k); };
  var AMP = String.fromCharCode(38);
  function esc(s) {
    return String(s == null ? "" : s)
      .split(AMP).join(AMP + "amp;")
      .split("<").join(AMP + "lt;")
      .split('"').join(AMP + "quot;");
  }

  var ctx = null;      /* { toolId, inputArea, outputArea, optionsArea, collect, apply, run, toast } */
  var pending = null;  /* last suggested patch awaiting confirmation */

  /* ------------------------------------------------------------------- render */
  function mount(context) {
    ctx = context;
    var host = document.getElementById("aiBar");
    if (!host) return;
    host.innerHTML =
      '<div class="ai-bar-head">' +
        '<span class="ai-bar-title">🤖 ' + esc(t("ai.bar.title")) + '</span>' +
        '<span class="ai-bar-mode" id="aiMode"></span>' +
      '</div>' +
      '<div class="ai-bar-row">' +
        '<input type="text" id="aiPrompt" placeholder="' + esc(t("ai.bar.placeholder")) + '">' +
        '<button class="btn-primary" id="aiPlanBtn">🪄 ' + esc(t("ai.bar.plan")) + '</button>' +
      '</div>' +
      '<div class="ai-bar-row ai-bar-actions">' +
        '<button class="btn-ghost" id="aiDiagBtn">🔍 ' + esc(t("ai.bar.diagnose")) + '</button>' +
        '<button class="btn-ghost" id="aiExplainBtn">💡 ' + esc(t("ai.bar.explain")) + '</button>' +
        '<button class="btn-ghost" id="aiPayloadBtn">🔒 ' + esc(t("ai.bar.payload")) + '</button>' +
        '<button class="btn-ghost" id="aiCfgBtn">⚙ ' + esc(t("ai.bar.settings")) + '</button>' +
      '</div>' +
      '<div class="ai-out" id="aiOut" hidden></div>';

    document.getElementById("aiPlanBtn").addEventListener("click", doPlan);
    document.getElementById("aiDiagBtn").addEventListener("click", doDiagnose);
    document.getElementById("aiExplainBtn").addEventListener("click", doExplain);
    document.getElementById("aiPayloadBtn").addEventListener("click", showPayload);
    document.getElementById("aiCfgBtn").addEventListener("click", function () { window.DFPAIPanel.open(); });
    document.getElementById("aiPrompt").addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); doPlan(); }
    });
    refreshMode();
  }

  function refreshMode() {
    var el = document.getElementById("aiMode");
    if (!el) return;
    var on = window.DFPAI.isConfigured();
    el.textContent = on ? t("ai.mode.model") + " · " + window.DFPAI.getConfig().model : t("ai.mode.offline");
    el.className = "ai-bar-mode " + (on ? "on" : "off");
  }

  function out(html, kind) {
    var el = document.getElementById("aiOut");
    if (!el) return;
    el.hidden = false;
    el.className = "ai-out" + (kind ? " " + kind : "");
    el.innerHTML = html;
  }

  function busy(msg) {
    out('<p class="ai-busy">' + esc(msg) + '</p>');
  }

  /* Human-readable label for an option key/value pair. */
  function labelOf(key, value) {
    var label = t("opt." + key);
    if (label === "opt." + key) label = key;
    var shown = value;
    if (typeof value === "boolean") shown = value ? "✔" : "✘";
    else {
      var vk = t("opt." + key + "." + value);
      if (vk !== "opt." + key + "." + value) shown = vk;
    }
    return esc(label) + " → <b>" + esc(shown) + "</b>";
  }

  /* Show a patch as a diff against the current control values. */
  function renderPatch(patch, extraHtml) {
    var current = ctx.collect();
    var keys = Object.keys(patch);
    if (!keys.length) {
      out('<p>' + esc(t("ai.plan.none")) + '</p>' + (extraHtml || ""), "warn");
      pending = null;
      return;
    }
    var rows = keys.map(function (k) {
      var same = String(current[k]) === String(patch[k]);
      return '<li' + (same ? ' class="same"' : '') + '>' + labelOf(k, patch[k]) +
             (same ? ' <em>(' + esc(t("ai.plan.unchanged")) + ')</em>' : '') + '</li>';
    }).join("");
    pending = patch;
    out('<p class="ai-out-title">' + esc(t("ai.plan.title")) + '</p>' +
        '<ul class="ai-patch">' + rows + '</ul>' +
        (extraHtml || "") +
        '<div class="ai-out-actions">' +
          '<button class="btn-primary" id="aiApply">✅ ' + esc(t("ai.plan.apply")) + '</button>' +
          '<button class="btn-primary" id="aiApplyRun">⚡ ' + esc(t("ai.plan.applyRun")) + '</button>' +
          '<button class="btn-ghost" id="aiDismiss">' + esc(t("ai.plan.dismiss")) + '</button>' +
        '</div>');
    document.getElementById("aiApply").addEventListener("click", function () { applyPending(false); });
    document.getElementById("aiApplyRun").addEventListener("click", function () { applyPending(true); });
    document.getElementById("aiDismiss").addEventListener("click", function () {
      pending = null;
      document.getElementById("aiOut").hidden = true;
    });
  }

  function applyPending(alsoRun) {
    if (!pending) return;
    var n = ctx.apply(pending);
    ctx.toast(t("ai.plan.applied") + " (" + n + ")");
    pending = null;
    document.getElementById("aiOut").hidden = true;
    if (alsoRun) ctx.run();
  }

  function errHtml(res) {
    return res && res.fallbackError
      ? '<p class="ai-warn">⚠ ' + esc(t("ai.err.fallback")) + " " + esc(res.fallbackError) + '</p>'
      : "";
  }


  /* Ask once before the first outbound request. */
  function ensureConsent() {
    if (!window.DFPAI.isConfigured()) return true;      /* offline path, nothing leaves */
    if (window.DFPAI.hasConsent()) return true;
    var ok = window.confirm(t("ai.consent"));
    if (ok) window.DFPAI.grantConsent();
    return ok;
  }

  /* ------------------------------------------------------------------ actions */
  function doPlan() {
    var q = document.getElementById("aiPrompt").value.trim();
    if (!q) { ctx.toast(t("ai.err.noPrompt")); return; }
    if (!ensureConsent()) return;
    busy(t("ai.busy.plan"));
    window.DFPAssist.plan(ctx.toolId, q, ctx.inputArea.value).then(function (res) {
      var extra = "";
      if (res.notes === "AI_LOCAL_NO_MATCH") {
        extra += '<p class="ai-warn">' + esc(t("ai.local.noMatch")) + '</p>';
      }
      if (res.explain) extra += '<p class="ai-explain">' + esc(res.explain) + '</p>';
      (res.warnings || []).forEach(function (w) {
        extra += '<p class="ai-warn">⚠ ' + esc(w) + '</p>';
      });
      if (res.rejected && res.rejected.length) {
        extra += '<p class="ai-warn">' + esc(t("ai.plan.rejected")) + " " + esc(res.rejected.join(", ")) + '</p>';
      }
      extra += errHtml(res);
      renderPatch(res.patch, extra);
    }, function (err) {
      out('<p class="ai-warn">⚠ ' + esc(err.message) + '</p>', "warn");
    });
  }

  function doDiagnose() {
    var text = ctx.inputArea.value.trim();
    if (!text) { ctx.toast(t("wb.no.data")); return; }
    if (!ensureConsent()) return;
    busy(t("ai.busy.diagnose"));
    window.DFPAssist.diagnose(ctx.toolId, text).then(function (res) {
      var p = res.profile;
      var head = '<p class="ai-out-title">' + esc(t("ai.diag.title")) + '</p>' +
        '<p class="ai-profile">' + p.rows + " " + esc(t("wb.stat.rows")) + " · " +
        p.cols + " " + esc(t("wb.stat.cols")) + " · " +
        esc(t("ai.diag.delimiter")) + " <b>" + esc(p.delimiter === "\t" ? "\\t" : p.delimiter) + "</b></p>";
      if (res.summary) head += '<p class="ai-explain">' + esc(res.summary) + '</p>';

      var items = (res.findings || []).slice();
      if (!items.length) {
        items = (p.issues || []).map(function (it) {
          var msg = t("ai.issue." + it.code);
          if (msg === "ai.issue." + it.code) msg = it.code;
          return msg + ": " + it.n;
        });
      }
      if (items.length) {
        head += '<ul class="ai-findings">' + items.map(function (f) {
          return "<li>" + esc(f) + "</li>";
        }).join("") + "</ul>";
      } else {
        head += '<p class="ai-ok">✅ ' + esc(t("ai.diag.clean")) + '</p>';
      }
      head += errHtml(res);
      renderPatch(res.patch || {}, head);
    }, function (err) {
      out('<p class="ai-warn">⚠ ' + esc(err.message) + '</p>', "warn");
    });
  }

  function doExplain() {
    var o = ctx.outputArea.value.trim();
    if (!o) { ctx.toast(t("ai.err.noOutput")); return; }
    if (!window.DFPAI.isConfigured()) {
      out('<p class="ai-warn">' + esc(t("ai.explain.needsModel")) +
          ' <button class="btn-ghost" id="aiOpenCfg">⚙ ' + esc(t("ai.bar.settings")) + '</button></p>', "warn");
      document.getElementById("aiOpenCfg").addEventListener("click", function () { window.DFPAIPanel.open(); });
      return;
    }
    if (!ensureConsent()) return;
    busy(t("ai.busy.explain"));
    window.DFPAssist.explain(ctx.toolId, ctx.collect(), ctx.inputArea.value, o).then(function (res) {
      out('<p class="ai-out-title">' + esc(t("ai.explain.title")) + '</p>' +
          '<pre class="ai-text">' + esc(res.text) + '</pre>');
    }, function (err) {
      out('<p class="ai-warn">⚠ ' + esc(err.message) + '</p>', "warn");
    });
  }

  /* Full transparency: show exactly what would be transmitted. */
  function showPayload() {
    var cfg = window.DFPAI.getConfig();
    var sample = window.DFPAI.buildSample(ctx.inputArea.value);
    var target = window.DFPAI.isConfigured()
      ? cfg.baseUrl + " · " + cfg.model
      : t("ai.payload.offline");
    out('<p class="ai-out-title">' + esc(t("ai.payload.title")) + '</p>' +
        '<p class="ai-profile">' + esc(t("ai.payload.target")) + " <b>" + esc(target) + "</b> · " +
        esc(t("ai.payload.mask")) + " <b>" + (cfg.mask ? "✔" : "✘") + "</b> · " +
        esc(t("ai.payload.limit")) + " <b>" + cfg.maxRows + " / " + cfg.maxChars + "</b></p>" +
        '<pre class="ai-text">' + esc(sample || t("wb.no.data")) + '</pre>');
  }

  document.addEventListener("ai-config-change", refreshMode);

  return { mount: mount, refreshMode: refreshMode };
})();

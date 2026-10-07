/* DataForge — AI Layer (optional, opt-in, privacy-first)
 *
 * Design rules (do not break the core promise of this app):
 *   1. Disabled by default. If the user never configures a provider, ZERO network
 *      requests are made and every original feature keeps working unchanged.
 *   2. Works without any API key too: a local, rule-based fallback ("AI-lite")
 *      handles intent -> options and tool recommendation fully offline.
 *   3. Only a small, optionally masked SAMPLE of the data is ever sent, and the
 *      exact payload can be inspected by the user before sending.
 *   4. OpenAI-compatible endpoint, so local runtimes (Ollama / LM Studio /
 *      vLLM / one-api) work as well — keeping everything on-device.
 */
window.DFPAI = (function () {
  "use strict";

  var LS_KEY = "dfp_ai_cfg";
  var LS_CONSENT = "dfp_ai_consent";

  var DEFAULTS = {
    enabled: false,
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    model: "gpt-4o-mini",
    maxRows: 20,
    maxChars: 2000,
    mask: true,
    temperature: 0.2,
  };

  var PRESETS = {
    openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
    deepseek: { baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
    ollama: { baseUrl: "http://localhost:11434/v1", model: "qwen2.5:7b" },
    lmstudio: { baseUrl: "http://localhost:1234/v1", model: "local-model" },
  };

  /* ------------------------------------------------------------------ config */
  function getConfig() {
    var cfg = {};
    for (var k in DEFAULTS) cfg[k] = DEFAULTS[k];
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        for (var j in saved) if (j in DEFAULTS) cfg[j] = saved[j];
      }
    } catch (e) {}
    return cfg;
  }

  function setConfig(patch) {
    var cfg = getConfig();
    for (var k in patch) if (k in DEFAULTS) cfg[k] = patch[k];
    try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch (e) {}
    return cfg;
  }

  /* A local runtime needs no key; a hosted one does. */
  function isLocalEndpoint(url) {
    return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/i.test(url || "");
  }

  function isConfigured() {
    var c = getConfig();
    if (!c.enabled || !c.baseUrl || !c.model) return false;
    return !!c.apiKey || isLocalEndpoint(c.baseUrl);
  }

  function hasConsent() {
    try { return localStorage.getItem(LS_CONSENT) === "1"; } catch (e) { return false; }
  }
  function grantConsent() {
    try { localStorage.setItem(LS_CONSENT, "1"); } catch (e) {}
  }

  /* ------------------------------------------------------- sample + masking */
  function maskText(text) {
    return String(text)
      .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "user@example.com")
      .replace(/\b(?:\+?86[- ]?)?1[3-9]\d{9}\b/g, "13800000000")
      .replace(/\b\d{15}(?:\d{2}[\dXx])?\b/g, "000000000000000")
      .replace(/\bhttps?:\/\/[^\s,;"']+/g, "https://example.com");
  }

  /* Builds the exact string that would be sent to the model. */
  function buildSample(text, cfg) {
    cfg = cfg || getConfig();
    var s = String(text == null ? "" : text);
    var lines = s.split(/\r?\n/);
    var truncRows = lines.length > cfg.maxRows;
    if (truncRows) lines = lines.slice(0, cfg.maxRows);
    var out = lines.join("\n");
    var truncChars = out.length > cfg.maxChars;
    if (truncChars) out = out.slice(0, cfg.maxChars);
    if (cfg.mask) out = maskText(out);
    if (truncRows || truncChars) out += "\n… (truncated sample)";
    return out;
  }

  /* --------------------------------------------------------------- transport */
  function chat(messages, opts) {
    opts = opts || {};
    var cfg = getConfig();
    if (!isConfigured()) return Promise.reject(new Error("AI_NOT_CONFIGURED"));

    var url = cfg.baseUrl.replace(/\/+$/, "") + "/chat/completions";
    var headers = { "Content-Type": "application/json" };
    if (cfg.apiKey) headers["Authorization"] = "Bearer " + cfg.apiKey;

    var body = {
      model: cfg.model,
      temperature: opts.temperature != null ? opts.temperature : cfg.temperature,
      messages: messages,
    };
    if (opts.json) body.response_format = { type: "json_object" };

    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, opts.timeout || 60000) : null;

    return fetch(url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(body),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      if (timer) clearTimeout(timer);
      return res.text().then(function (txt) {
        if (!res.ok) {
          var msg = txt;
          try { msg = JSON.parse(txt).error.message || txt; } catch (e) {}
          throw new Error("HTTP " + res.status + ": " + String(msg).slice(0, 300));
        }
        var data = JSON.parse(txt);
        var choice = data.choices && data.choices[0];
        var content = choice && choice.message && choice.message.content;
        if (!content) throw new Error("Empty response from model");
        return content;
      });
    }, function (err) {
      if (timer) clearTimeout(timer);
      if (err && err.name === "AbortError") throw new Error("Request timed out");
      throw new Error((err && err.message ? err.message : "Network error") +
        " — check base URL / CORS (a local runtime such as Ollama works best)");
    });
  }

  function testConnection() {
    return chat([{ role: "user", content: "Reply with the single word: ok" }], { timeout: 20000 })
      .then(function (t) { return String(t).trim().slice(0, 40); });
  }

  /* --------------------------------------------------------- JSON extraction */
  function parseJSONLoose(text) {
    var s = String(text).trim();
    s = s.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    try { return JSON.parse(s); } catch (e) {}
    var a = s.indexOf("{"), b = s.lastIndexOf("}");
    if (a >= 0 && b > a) {
      try { return JSON.parse(s.slice(a, b + 1)); } catch (e2) {}
    }
    throw new Error("Model did not return valid JSON");
  }

  return {
    DEFAULTS: DEFAULTS,
    PRESETS: PRESETS,
    getConfig: getConfig,
    setConfig: setConfig,
    isConfigured: isConfigured,
    isLocalEndpoint: isLocalEndpoint,
    hasConsent: hasConsent,
    grantConsent: grantConsent,
    maskText: maskText,
    buildSample: buildSample,
    chat: chat,
    testConnection: testConnection,
    parseJSONLoose: parseJSONLoose
  };
})();

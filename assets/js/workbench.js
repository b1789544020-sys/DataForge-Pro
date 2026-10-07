/* DataForge — Tool Workbench (v2, fully integrated)
 * Bridges the tool registry (tools-data.js) with the engine (engine.js).
 * All processing is 100% in-browser, zero network calls.
 * Open source: every tool is unlocked, no paywall, no license gate.
 */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const t = k => window.DFP.t(k);

  const params = new URLSearchParams(location.search);
  const toolId = params.get("id");
  const tool = window.DFP.getTool(toolId);
  if (!tool) { location.href = "index.html"; return; }

  const inputArea = $("inputArea");
  const outputArea = $("outputArea");
  const optionsArea = $("optionsArea");
  const inputStat = $("inputStat");
  const outputStat = $("outputStat");
  const langToggle = $("langToggle");
  const imagePreview = $("imagePreview");
  const outputExtra = $("outputExtra");

  let loadedImages = [];
  let processedImages = [];
  let multiTables = [];
  let lastMime = "text/plain";
  let lastExt = "txt";

  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 1600);
  }
  var AMP = String.fromCharCode(38);   // &
  var LT = String.fromCharCode(60);    // <
  function esc(s) {
    return String(s)
      .split(AMP).join(AMP + "amp;")
      .split('"').join(AMP + "quot;")
      .split("<").join(AMP + "lt;");
  }

  /* ============================== i18n Static Text ============================== */
  function renderStaticText() {
    $("toolIcon").textContent = tool.icon;
    $("toolName").textContent = t("tool." + tool.id + ".name");
    $("toolDesc").textContent = t("tool." + tool.id + ".desc");
    document.title = "DataForge — " + t("tool." + tool.id + ".name");
    $("lblInput").textContent = t("wb.input");
    $("lblOptions").textContent = t("wb.options");
    $("lblOutput").textContent = t("wb.output");
    $("loadSample").textContent = t("wb.sample");
    $("clearInput").textContent = t("wb.clear");
    $("runBtn").textContent = t("wb.run");
    $("copyBtn").textContent = t("wb.copy");
    $("downloadBtn").textContent = t("wb.export");
    inputArea.placeholder = t("wb.input.placeholder");
    outputArea.placeholder = t("wb.output.placeholder");
    const up = (tool.io === "multifile" || tool.io === "images") ? t("wb.upload.multi") : t("wb.upload");
    $("lblUpload").childNodes[0].nodeValue = up + " ";
    langToggle.textContent = window.DFP.lang === "zh" ? "EN" : "中文";
  }

  /* ============================== Options UI ============================== */
  function optPh(k) {
    const v = t("opt." + k + ".placeholder");
    return v === "opt." + k + ".placeholder" ? "" : v;
  }
  function optTip(k) {
    const v = t("opt." + k + ".tip");
    return v === "opt." + k + ".tip" ? "" : v;
  }

  function buildOptions() {
    const schema = tool.options || [];
    let html = "";
    function addTip(k) {
      const tip = optTip(k);
      return tip ? ' title="' + esc(tip) + '"' : "";
    }
    schema.forEach(function (opt) {
      const label = t("opt." + opt.key);
      const ta = addTip(opt.key);
      if (opt.type === "checkbox") {
        html += '<label class="opt-check"' + ta + '><input type="checkbox" data-key="' + opt.key + '" ' + (opt.default ? "checked" : "") + '><span>' + label + '</span></label>';
      } else if (opt.type === "text") {
        html += '<label class="opt-field"' + ta + '><span>' + label + '</span><input type="text" data-key="' + opt.key + '" value="' + esc(opt.default || "") + '" placeholder="' + esc(optPh(opt.key)) + '"></label>';
      } else if (opt.type === "number") {
        html += '<label class="opt-field"' + ta + '><span>' + label + '</span><input type="number" data-key="' + opt.key + '" value="' + (opt.default != null ? opt.default : 0) + '" placeholder="' + esc(optPh(opt.key)) + '"></label>';
      } else if (opt.type === "range") {
        html += '<label class="opt-field"' + ta + '><span>' + label + ': <b data-out="' + opt.key + '">' + opt.default + '</b></span><input type="range" data-key="' + opt.key + '" min="' + (opt.min || 0) + '" max="' + (opt.max || 100) + '" value="' + opt.default + '" oninput="this.parentNode.querySelector(\'[data-out]\').textContent=this.value"></label>';
      } else if (opt.type === "select") {
        var os = opt.opts.map(function (v) {
          return '<option value="' + v + '" ' + (v === opt.default ? "selected" : "") + '>' + t("opt." + opt.key + "." + v) + '</option>';
        }).join("");
        html += '<label class="opt-field"' + ta + '><span>' + label + '</span><select data-key="' + opt.key + '">' + os + '</select></label>';
      } else if (opt.type === "columns") {
        html += '<div class="opt-columns" data-key="' + opt.key + '"><span class="opt-col-label">' + label + '</span><div class="col-list" id="colList">' + t("wb.no.data") + '</div></div>';
      }
    });
    optionsArea.innerHTML = html || '<p class="opt-info">— ' + t("wb.options") + ' —</p>';
    refreshColumnList();
  }

  function refreshColumnList() {
    var c = optionsArea.querySelector("#colList");
    if (!c) return;
    var rows;
    try { rows = DFPEngine.parseCSV(inputArea.value); } catch (e) { rows = []; }
    if (!rows.length || !inputArea.value.trim()) { c.innerHTML = t("wb.no.data"); return; }
    /* Keep the user's current selection when the header is unchanged. */
    var prev = {};
    var hadChecks = false;
    c.querySelectorAll(".col-item input[type=checkbox]").forEach(function (cb) {
      hadChecks = true;
      prev[cb.parentNode.textContent.trim()] = cb.checked;
    });
    var header = rows[0];
    var html = "";
    header.forEach(function (h, i) {
      var name = String(h);
      var on = hadChecks && Object.prototype.hasOwnProperty.call(prev, name) ? prev[name] : true;
      html += '<label class="col-item"><input type="checkbox" data-col="' + i + '"' + (on ? " checked" : "") + '><span>' + esc(name) + '</span></label>';
    });
    c.innerHTML = html;
  }

  /* Applies an AI-suggested option patch to the live controls.
   * Returns how many controls were actually changed. */
  function applyOptionPatch(patch) {
    var n = 0;
    Object.keys(patch || {}).forEach(function (key) {
      var el = optionsArea.querySelector('[data-key="' + key + '"]');
      if (!el) return;
      var tag = el.tagName.toLowerCase();
      var value = patch[key];
      if (tag === "input" && el.type === "checkbox") {
        if (el.checked !== !!value) { el.checked = !!value; n++; }
      } else if (tag === "select") {
        var ok = Array.prototype.some.call(el.options, function (o) { return o.value === String(value); });
        if (ok && el.value !== String(value)) { el.value = String(value); n++; }
      } else if (tag === "input" || tag === "textarea") {
        if (el.value !== String(value)) {
          el.value = String(value);
          if (el.type === "range") {
            var outEl = el.parentNode.querySelector("[data-out]");
            if (outEl) outEl.textContent = el.value;
          }
          n++;
        }
      }
    });
    return n;
  }

  function collectOptions() {
    var opts = {};
    optionsArea.querySelectorAll("[data-key]").forEach(function (el) {
      var key = el.getAttribute("data-key");
      var tag = el.tagName.toLowerCase();
      if (tag === "input" && el.type === "checkbox") opts[key] = el.checked;
      else if (tag === "input" || tag === "select" || tag === "textarea") opts[key] = el.value;
      else if (tag === "div") {
        var checks = el.querySelectorAll(".col-item input[type=checkbox]:checked");
        opts[key] = Array.from(checks).map(function (c) { return parseInt(c.getAttribute("data-col"), 10); });
      }
    });
    return opts;
  }

  /* ============================== File Upload ============================== */
  $("fileInput").addEventListener("change", function (e) {
    var files = e.target.files;
    if (!files.length) return;
    if (tool.io === "images") {
      loadedImages = [];
      imagePreview.innerHTML = "";
      Array.from(files).forEach(function (f) {
        if (!f.type.startsWith("image/")) { toast(t("err.fileType").replace("%s", f.type)); return; }
        var reader = new FileReader();
        reader.onload = function (ev) {
          loadedImages.push({ name: f.name, blob: new Blob([ev.target.result], { type: f.type }), _url: URL.createObjectURL(new Blob([ev.target.result], { type: f.type })) });
          var fig = document.createElement("figure");
          fig.className = "img-thumb";
          fig.innerHTML = '<img src="' + loadedImages[loadedImages.length - 1]._url + '"><figcaption>' + esc(f.name) + ' (' + (f.size / 1024).toFixed(1) + 'KB)</figcaption>';
          imagePreview.appendChild(fig);
        };
        reader.readAsArrayBuffer(f);
      });
      toast(t("wb.upload.multi") + " (" + files.length + ")");
    } else if (tool.io === "multifile") {
      multiTables = [];
      Array.from(files).forEach(function (f) {
        var reader = new FileReader();
        reader.onload = function (ev) {
          try { var rows = DFPEngine.parseCSV(ev.target.result); multiTables.push(rows); } catch (e) { toast(t("err.parseCSV").replace("%s", f.name)); }
        };
        reader.readAsText(f);
      });
      toast(t("wb.upload.multi") + " (" + files.length + " files)");
    } else {
      var f = files[0];
      var reader = new FileReader();
      reader.onload = function (ev) { inputArea.value = ev.target.result; updateStats(); };
      if (f.type === "text/csv" || f.name.endsWith(".csv") || f.name.endsWith(".tsv") || f.name.endsWith(".txt") || f.name.endsWith(".json") || f.name.endsWith(".sql") || f.name.endsWith(".md")) {
        reader.readAsText(f);
      } else {
        toast(t("err.fileType").replace("%s", f.name));
      }
    }
    e.target.value = "";
  });

  /* ============================== Stats ============================== */
  function updateStats() {
    var v = inputArea.value;
    inputStat.textContent = (v.length ? (v.split(/\r?\n/).length + " " + t("wb.stat.lines") + " · " + v.length + " " + t("wb.stat.chars")) : "");
  }
  inputArea.addEventListener("input", updateStats);
  /* Column checkboxes must track whatever is in the textarea, not just samples. */
  var colRefreshTimer = null;
  function scheduleColumnRefresh() {
    clearTimeout(colRefreshTimer);
    colRefreshTimer = setTimeout(refreshColumnList, 150);
  }
  inputArea.addEventListener("input", scheduleColumnRefresh);
  inputArea.addEventListener("paste", function () { setTimeout(refreshColumnList, 0); });
  inputArea.addEventListener("change", refreshColumnList);

  /* ============================== Processing (Core) ============================== */
  function processText(text, opts) {
    var result = "";
    try {
      switch (toolId) {
        /* ---- Table tools ---- */
        case "csv-cleaner": {
          var rows = DFPEngine.parseCSV(text);
          lastExt = "csv"; lastMime = "text/csv";
          result = DFPEngine.toCSV(DFPEngine.cleanCSV(rows, opts));
          break;
        }
        case "column-extractor": {
          var rows = DFPEngine.parseCSV(text);
          lastExt = "csv"; lastMime = "text/csv";
          var selected = opts.selectedCols || rows[0].map(function (_, i) { return i; });
          result = DFPEngine.toCSV(DFPEngine.extractColumns(rows, { selected: selected }));
          break;
        }
        case "csv-to-json": {
          if (opts.jsonFrom === "json") {
            lastExt = "csv"; lastMime = "text/csv";
            result = DFPEngine.jsonToCSV(text);
          } else {
            var rows = DFPEngine.parseCSV(text);
            lastExt = "json"; lastMime = "application/json";
            result = DFPEngine.csvToJSON(rows, opts);
          }
          break;
        }
        case "csv-to-sql": {
          var rows = DFPEngine.parseCSV(text);
          lastExt = "sql"; lastMime = "text/plain";
          result = DFPEngine.csvToSQL(rows, opts);
          break;
        }
        case "csv-to-markdown": {
          var rows = DFPEngine.parseCSV(text);
          lastExt = "md"; lastMime = "text/markdown";
          result = DFPEngine.toMarkdown(rows, opts);
          break;
        }
        case "json-formatter": {
          lastExt = "json"; lastMime = "application/json";
          result = DFPEngine.formatJSON(text, opts);
          break;
        }
        case "base64-tool": {
          lastExt = "txt"; lastMime = "text/plain";
          result = DFPEngine.codec(text, opts.base64Mode || "encode");
          break;
        }
        case "text-batch": {
          lastExt = "txt"; lastMime = "text/plain";
          result = DFPEngine.textBatch(text, opts);
          break;
        }
        case "case-converter": {
          lastExt = "txt"; lastMime = "text/plain";
          result = DFPEngine.convertCase(text, opts.target || "camel");
          break;
        }
        case "regex-tester": {
          lastExt = "txt"; lastMime = "text/plain";
          var r = DFPEngine.regexTest(opts.regexPattern || "", opts.flags || "", text, opts.regexReplace || "");
          result = t("opt.matchCount") + ": " + r.count + "\n";
          if (r.replaced !== null) result += "--- " + (tool.io === "regex" ? "Replacement" : "Replace") + " ---\n" + r.replaced + "\n";
          result += "--- Matches ---\n";
          if (r.matches.length) {
            r.matches.forEach(function (m, i) {
              result += (i + 1) + '. "' + m.match + '" @' + m.index + (m.groups.length ? " [" + m.groups.join(", ") + "]" : "") + "\n";
            });
          } else {
            result += "(no matches)\n";
          }
          break;
        }
        default:
          result = text;
      }
    } catch (e) {
      result = t("wb.stat.error") + e.message;
    }
    return result;
  }

  function runImages() {
    if (!loadedImages.length) { toast(t("wb.no.data")); return; }
    var opts = collectOptions();
    processedImages = [];
    imagePreview.innerHTML = "";
    var done = 0;
    var total = loadedImages.length;
    loadedImages.forEach(function (img, idx) {
      var imgEl = new Image();
      imgEl.onload = function () {
        var w = imgEl.width, h = imgEl.height;
        var maxW = parseInt(opts.imageWidth, 10) || 0;
        var maxH = parseInt(opts.imageHeight, 10) || 0;
        if (maxW > 0 && w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
        if (maxH > 0 && h > maxH) { w = Math.round(w * maxH / h); h = maxH; }
        var canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        var ctx = canvas.getContext("2d");
        if (opts.imageGrayscale) ctx.filter = "grayscale(100%)";
        ctx.drawImage(imgEl, 0, 0, w, h);
        if (opts.imageWatermark) {
          ctx.filter = "none";
          ctx.font = "bold 24px Arial";
          ctx.fillStyle = "rgba(255,255,255,0.6)";
          ctx.textAlign = "right";
          ctx.fillText(opts.imageWatermark, w - 10, h - 10);
        }
        var fmt = opts.imageFormat || "original";
        var mime = fmt === "jpeg" ? "image/jpeg" : fmt === "png" ? "image/png" : fmt === "webp" ? "image/webp" : img.blob.type;
        var ext = mime.split("/")[1].replace("jpeg", "jpg");
        var q = (parseInt(opts.imageQuality, 10) || 85) / 100;
        canvas.toBlob(function (blob) {
          var name = (img.name || "image").replace(/\.[^.]+$/, "") + "." + ext;
          var url = URL.createObjectURL(blob);
          processedImages.push({ name: name, blob: blob });
          var fig = document.createElement("figure");
          fig.className = "img-thumb";
          fig.innerHTML = '<img src="' + url + '"><figcaption>' + esc(name) + ' (' + (blob.size / 1024).toFixed(1) + 'KB)</figcaption>';
          imagePreview.appendChild(fig);
          done++;
          if (done >= total) toast(t("wb.run") + " (" + total + " " + t("wb.stat.records") + ")");
        }, mime, q);
      };
      imgEl.src = URL.createObjectURL(img.blob);
    });
  }

  function runMultifile() {
    var tables = multiTables;
    /* Fall back to the textarea: tables separated by a line containing only dashes. */
    if (!tables.length) {
      var raw = inputArea.value.trim();
      if (raw) {
        tables = raw.split(/^\s*-{3,}\s*$/m)
          .map(function (chunk) { return chunk.trim(); })
          .filter(function (chunk) { return chunk.length; })
          .map(function (chunk) { return DFPEngine.parseCSV(chunk); })
          .filter(function (rows) { return rows.length; });
      }
    }
    if (!tables.length) { toast(t("wb.no.data")); return; }
    var opts = collectOptions();
    try {
      var result = DFPEngine.mergeTables(tables, opts);
      lastExt = "csv"; lastMime = "text/csv";
      outputArea.value = DFPEngine.toCSV(result);
      updateOutputStats();
      toast(t("wb.run") + " (" + result.length + " " + t("wb.stat.rows") + ")");
    } catch (e) {
      outputArea.value = t("wb.stat.error") + e.message;
      updateOutputStats();
    }
  }

  function updateOutputStats() {
    var v = outputArea.value;
    outputStat.textContent = v.length ? (v.split(/\r?\n/).length + " " + t("wb.stat.lines") + " · " + v.length + " " + t("wb.stat.chars")) : "";
  }

  /* ============================== Run Button ============================== */
  $("runBtn").addEventListener("click", function () {
    if (tool.io === "images") { runImages(); return; }
    if (tool.io === "multifile") { runMultifile(); return; }
    var text = inputArea.value.trim();
    if (!text) { toast(t("wb.no.data")); return; }
    var opts = collectOptions();
    outputArea.value = processText(text, opts);
    updateOutputStats();
    toast(t("wb.run"));
  });
  inputArea.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") $("runBtn").click();
  });

  /* ============================== Copy / Download ============================== */
  $("copyBtn").addEventListener("click", function () {
    var v = outputArea.value;
    if (!v) { toast(t("wb.no.data")); return; }
    navigator.clipboard.writeText(v).then(function () { toast(t("wb.copied")); });
  });
  $("downloadBtn").addEventListener("click", function () {
    if (processedImages.length) {
      processedImages.forEach(function (pi) {
        var a = document.createElement("a");
        a.href = URL.createObjectURL(pi.blob);
        a.download = pi.name;
        a.click();
      });
      return;
    }
    var v = outputArea.value;
    if (!v) { toast(t("wb.no.data")); return; }
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([v], { type: lastMime }));
    a.download = "output." + lastExt;
    a.click();
  });

  /* Builds a few small images with canvas so the image tool is demoable offline. */
  function loadSampleImages() {
    loadedImages = [];
    processedImages = [];
    imagePreview.innerHTML = "";
    var specs = [
      { name: "sample-red.png", w: 480, h: 320, from: "#ff5f6d", to: "#ffc371", label: "DataForge 1" },
      { name: "sample-blue.png", w: 640, h: 360, from: "#36d1dc", to: "#5b86e5", label: "DataForge 2" },
      { name: "sample-green.png", w: 320, h: 320, from: "#11998e", to: "#38ef7d", label: "DataForge 3" }
    ];
    var pending = specs.length;
    specs.forEach(function (s) {
      var canvas = document.createElement("canvas");
      canvas.width = s.w; canvas.height = s.h;
      var c = canvas.getContext("2d");
      var grad = c.createLinearGradient(0, 0, s.w, s.h);
      grad.addColorStop(0, s.from);
      grad.addColorStop(1, s.to);
      c.fillStyle = grad;
      c.fillRect(0, 0, s.w, s.h);
      c.fillStyle = "rgba(255,255,255,0.9)";
      c.font = "bold 28px Arial";
      c.textAlign = "center";
      c.fillText(s.label, s.w / 2, s.h / 2);
      c.font = "16px Arial";
      c.fillText(s.w + "×" + s.h, s.w / 2, s.h / 2 + 28);
      canvas.toBlob(function (blob) {
        var url = URL.createObjectURL(blob);
        loadedImages.push({ name: s.name, blob: blob, _url: url });
        var fig = document.createElement("figure");
        fig.className = "img-thumb";
        fig.innerHTML = '<img src="' + url + '"><figcaption>' + esc(s.name) + ' (' + (blob.size / 1024).toFixed(1) + 'KB)</figcaption>';
        imagePreview.appendChild(fig);
        if (--pending === 0) toast(t("wb.sample") + " (" + loadedImages.length + ")");
      }, "image/png");
    });
  }

  /* ============================== Sample / Clear ============================== */
  $("loadSample").addEventListener("click", function () {
    if (tool.io === "images") { loadSampleImages(); return; }
    inputArea.value = tool.sample || "col1,col2\nval1,val2";
    if (tool.io === "multifile") multiTables = [];   /* pasted sample wins over stale uploads */
    updateStats();
    buildOptions();
    toast(t("wb.sample"));
  });
  $("clearInput").addEventListener("click", function () {
    inputArea.value = "";
    outputArea.value = "";
    loadedImages = [];
    processedImages = [];
    multiTables = [];
    imagePreview.innerHTML = "";
    updateStats();
    updateOutputStats();
    buildOptions();
  });

  /* ============================== Language ============================== */
  langToggle.addEventListener("click", function () {
    window.DFP.setLang(window.DFP.lang === "zh" ? "en" : "zh");
  });
  document.addEventListener("langchange", function () {
    renderStaticText();
    buildOptions();
    mountCopilot();
  });

  /* ============================== Drag & Drop ============================== */
  var dropZone = $("dropZone");
  if (dropZone) {
    ["dragenter", "dragover"].forEach(function (ev) {
      dropZone.addEventListener(ev, function (e) { e.preventDefault(); dropZone.classList.add("drag"); });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      dropZone.addEventListener(ev, function (e) { e.preventDefault(); dropZone.classList.remove("drag"); });
    });
    dropZone.addEventListener("drop", function (e) {
      var dt = e.dataTransfer;
      if (dt && dt.files && dt.files.length) {
        var fi = $("fileInput");
        fi.files = dt.files;
        fi.dispatchEvent(new Event("change"));
      }
    });
  }

  /* ============================== AI Copilot (optional) ============================== */
  /* The copilot only proposes option values; the engine above still does all work.
     If the AI scripts are absent the workbench keeps working unchanged. */
  function mountCopilot() {
    if (!window.DFPCopilot) return;
    window.DFPCopilot.mount({
      toolId: toolId,
      inputArea: inputArea,
      outputArea: outputArea,
      optionsArea: optionsArea,
      collect: collectOptions,
      apply: applyOptionPatch,
      run: function () { $("runBtn").click(); },
      toast: toast
    });
  }

  /* ============================== Init ============================== */
  if (tool.io === "images") {
    imagePreview.hidden = false;
  }
  renderStaticText();
  buildOptions();
  updateStats();
  updateOutputStats();
  mountCopilot();

  /* A task passed from the homepage AI picker pre-fills the copilot prompt. */
  (function prefillFromQuery() {
    var task = params.get("task");
    if (!task) return;
    var box = document.getElementById("aiPrompt");
    if (box) { box.value = task; box.focus(); }
  })();
})();
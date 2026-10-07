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
  let lastBinary = null;          // { blob, name } for xlsx / zip exports
  let wmImage = null;             // image watermark: { img, scale, opacity, tile }
  /* Normalized crop rect on the source image (0..1). Full frame = no crop. */
  const cropBox = { x: 0, y: 0, w: 1, h: 1, circle: false, aspect: 0 };

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
      } else if (opt.type === "color") {
        html += '<label class="opt-field opt-color"' + ta + '><span>' + label + '</span><input type="color" data-key="' + opt.key + '" value="' + esc(opt.default || "#ffffff") + '"></label>';
      } else if (opt.type === "file") {
        html += '<label class="opt-field opt-file"' + ta + '><span>' + label + '</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" data-key="' + opt.key + '" data-file="wm"><span class="file-status" data-for="' + opt.key + '"></span></label>';
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
    bindFileOptions();
  }

  /* File-type options (image watermark logo) are held in module state. */
  function bindFileOptions() {
    optionsArea.querySelectorAll('input[type="file"][data-file="wm"]').forEach(function (input) {
      input.addEventListener("change", function () {
        var f = input.files && input.files[0];
        var status = optionsArea.querySelector('.file-status[data-for="' + input.getAttribute("data-key") + '"]');
        if (!f) { wmImage = null; if (status) status.textContent = ""; return; }
        var reader = new FileReader();
        reader.onload = function (ev) {
          var im = new Image();
          im.onload = function () {
            wmImage = { img: im, name: f.name };
            if (status) status.textContent = "✓ " + f.name;
            toast(t("wb.wm.loaded") + " (" + f.name + ")");
          };
          im.src = ev.target.result;
        };
        reader.readAsDataURL(f);
      });
    });
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
      if (tag === "input" && el.type === "file") return;       // held in module state
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
      processedImages = [];
      imagePreview.innerHTML = "";
      var accepted = 0;
      Array.from(files).forEach(function (f) {
        var looksImage = f.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|avif|svg)$/i.test(f.name);
        if (!looksImage) { toast(t("err.fileType").replace("%s", f.name)); return; }
        accepted++;
        var reader = new FileReader();
        reader.onload = function (ev) {
          var buf = ev.target.result;
          var blob = new Blob([buf], { type: f.type || "image/png" });
          var item = {
            name: f.name,
            blob: blob,
            orientation: DFPEngine.jpegOrientation(buf),
            _url: URL.createObjectURL(blob)
          };
          loadedImages.push(item);
          appendThumb(item);
          if (loadedImages.length >= accepted) updateCropPanel();
        };
        reader.readAsArrayBuffer(f);
      });
      toast(t("wb.upload.multi") + " (" + files.length + ")");
    } else if (tool.io === "multifile") {
      multiTables = [];
      var pending = 0, okCount = 0, sheetCount = 0;
      var finishOne = function () { if (--pending === 0) refreshMultiStat(okCount, sheetCount); };
      Array.from(files).forEach(function (f) {
        var lname = f.name.toLowerCase();
        if (lname.endsWith(".xlsx")) {
          pending++;
          var rx = new FileReader();
          rx.onload = function (ev) {
            DFPXlsx.parseXLSX(ev.target.result).then(function (book) {
              book.sheets.forEach(function (s) {
                if (s.rows.length) { multiTables.push({ rows: s.rows, file: f.name, sheet: s.name }); sheetCount++; }
              });
              okCount++;
            }).catch(function (err) {
              toast(t("err.parseXLSX").replace("%s", f.name) + " — " + err.message);
            }).then(finishOne);
          };
          rx.readAsArrayBuffer(f);
        } else if (lname.endsWith(".xls")) {
          toast(t("err.oldXLS"));
        } else if (/\.(csv|tsv|txt)$/i.test(f.name)) {
          pending++;
          var rt = new FileReader();
          rt.onload = function (ev) {
            try {
              var rows = DFPEngine.parseCSV(ev.target.result);
              if (rows.length) { multiTables.push({ rows: rows, file: f.name }); okCount++; sheetCount++; }
            } catch (e) { toast(t("err.parseCSV").replace("%s", f.name)); }
            finishOne();
          };
          rt.readAsText(f);
        } else {
          toast(t("err.fileType").replace("%s", f.name));
        }
      });
      toast(t("wb.upload.multi") + " (" + files.length + ")");
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

  /* Input thumbnail with a remove (×) button. */
  function appendThumb(item) {
    var fig = document.createElement("figure");
    fig.className = "img-thumb";
    fig.innerHTML = '<img src="' + item._url + '"><figcaption>'
      + esc(item.name) + " (" + (item.blob.size / 1024).toFixed(1) + "KB)</figcaption>";
    var x = document.createElement("button");
    x.className = "remove-img"; x.type = "button"; x.textContent = "×";
    x.title = t("wb.clear");
    x.addEventListener("click", function () {
      loadedImages = loadedImages.filter(function (im) { return im !== item; });
      if (item._url) URL.revokeObjectURL(item._url);
      fig.remove();
      updateCropPanel();
    });
    fig.appendChild(x);
    imagePreview.appendChild(fig);
  }

  function refreshMultiStat(files, sheets) {
    inputStat.textContent = t("wb.multi.loaded").replace("%f", files).replace("%s", sheets);
  }

  function browserSave(blob, name) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }

  function loadImage(url) {
    return new Promise(function (resolve, reject) {
      var im = new Image();
      im.onload = function () { resolve(im); };
      im.onerror = reject;
      im.src = url;
    });
  }

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

  /* ===================== Crop editor (interactive) ===================== */
  var cropPanel = null, cropCanvas = null, cropCtx = null, cropImg = null;
  var CW = 460, CH = 300;                       // editor viewport in CSS px
  var fit = { dx: 0, dy: 0, dw: 0, dh: 0 };     // contained image rect
  var dragMode = null;                          // 'move' | 'nw' | 'ne' | 'sw' | 'se'

  function buildCropPanel() {
    if (toolId !== "image-batch") return;
    cropPanel = document.createElement("div");
    cropPanel.className = "crop-panel";
    cropPanel.hidden = true;
    var specs = [["free", 0], ["sq", 1], ["r43", 4 / 3], ["r169", 16 / 9]];
    var btns = specs.map(function (s) {
      return '<button type="button" class="crop-btn" data-ar="' + s[1] + '">' + t("wb.crop." + s[0]) + "</button>";
    }).join("");
    cropPanel.innerHTML =
      '<div class="crop-head"><b>' + t("wb.crop.title") + '</b>'
      + '<span class="crop-hint">' + t("wb.crop.hint") + "</span></div>"
      + '<canvas id="cropCanvas" width="' + (CW * 2) + '" height="' + (CH * 2) + '"></canvas>'
      + '<div class="crop-actions">' + btns
      + '<button type="button" class="crop-btn" data-circle>' + t("wb.crop.circle") + "</button>"
      + '<button type="button" class="crop-btn" data-reset>' + t("wb.crop.reset") + "</button>"
      + "</div>";
    imagePreview.parentNode.insertBefore(cropPanel, imagePreview.nextSibling);
    cropCanvas = $("cropCanvas");
    cropCtx = cropCanvas.getContext("2d");

    cropPanel.querySelectorAll(".crop-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        cropBox.circle = false;
        if (b.hasAttribute("data-reset")) { resetCrop(); drawCrop(); return; }
        if (b.hasAttribute("data-circle")) { cropBox.circle = true; drawCrop(); return; }
        var ar = parseFloat(b.getAttribute("data-ar"));
        cropBox.aspect = ar;
        if (ar && cropImg) {
          var IW = cropImg.naturalWidth, IH = cropImg.naturalHeight;
          var hn = 0.85, wn = hn * ar * IH / IW;
          if (wn > 0.95) { wn = 0.95; hn = wn * IW / (ar * IH); }
          cropBox.w = wn; cropBox.h = hn;
          cropBox.x = (1 - wn) / 2; cropBox.y = (1 - hn) / 2;
        }
        drawCrop();
      });
    });

    function evNorm(e) {
      var r = cropCanvas.getBoundingClientRect();
      var x = (e.clientX - r.left) * (CW / r.width);
      var y = (e.clientY - r.top) * (CH / r.height);
      return { x: (x - fit.dx) / fit.dw, y: (y - fit.dy) / fit.dh };
    }
    function hitCorner(nx, ny) {
      var b = cropBox, K = 0.04;
      var near = function (cx, cy) { return Math.abs(nx - cx) <= K && Math.abs(ny - cy) <= K; };
      if (near(b.x, b.y)) return "nw";
      if (near(b.x + b.w, b.y)) return "ne";
      if (near(b.x, b.y + b.h)) return "sw";
      if (near(b.x + b.w, b.y + b.h)) return "se";
      if (nx >= b.x && nx <= b.x + b.w && ny >= b.y && ny <= b.y + b.h) return "move";
      return null;
    }
    var start = null;
    cropCanvas.addEventListener("pointerdown", function (e) {
      if (!cropImg) return;
      var n = evNorm(e), m = hitCorner(n.x, n.y);
      if (!m) return;
      dragMode = m;
      start = { x: n.x, y: n.y, box: Object.assign({}, cropBox) };
      cropCanvas.setPointerCapture(e.pointerId);
    });
    cropCanvas.addEventListener("pointermove", function (e) {
      if (!dragMode) {
        if (cropImg) cropCanvas.style.cursor = hitCorner(evNorm(e).x, evNorm(e).y) ? "crosshair" : "default";
        return;
      }
      var n = evNorm(e), b = cropBox, s = start.box;
      var dx = Math.max(-1, Math.min(1, n.x - start.x));
      var dy = Math.max(-1, Math.min(1, n.y - start.y));
      if (dragMode === "move") {
        b.x = Math.max(0, Math.min(1 - b.w, s.x + dx));
        b.y = Math.max(0, Math.min(1 - b.h, s.y + dy));
      } else {
        var left = dragMode.indexOf("w") >= 0, top = dragMode.indexOf("n") >= 0;
        var nx0 = left ? Math.min(s.x + dx, s.x + s.w - 0.05) : s.x;
        var nx1 = left ? s.x + s.w : Math.max(s.x + dx, s.x + 0.05);
        var ny0 = top ? Math.min(s.y + dy, s.y + s.h - 0.05) : s.y;
        var ny1 = top ? s.y + s.h : Math.max(s.y + dy, s.y + 0.05);
        b.x = Math.max(0, nx0); b.y = Math.max(0, ny0);
        b.w = Math.min(nx1, 1) - b.x; b.h = Math.min(ny1, 1) - b.y;
        b.aspect = 0;
      }
      drawCrop();
    });
    var endDrag = function () { dragMode = null; };
    cropCanvas.addEventListener("pointerup", endDrag);
    cropCanvas.addEventListener("pointercancel", endDrag);

    /* Deterministic hooks for automated tests. */
    window.__dfpTest = {
      setCrop: function (v) { Object.assign(cropBox, v); drawCrop(); },
      getCrop: function () { return Object.assign({}, cropBox); },
      setWmImage: function (im) { wmImage = im ? { img: im } : null; }
    };
  }

  function resetCrop() {
    cropBox.x = 0; cropBox.y = 0; cropBox.w = 1; cropBox.h = 1;
    cropBox.circle = false; cropBox.aspect = 0;
  }

  function drawCrop() {
    if (!cropCtx) return;
    cropCtx.setTransform(2, 0, 0, 2, 0, 0);
    cropCtx.clearRect(0, 0, CW, CH);
    cropCtx.fillStyle = "#0b0d13";
    cropCtx.fillRect(0, 0, CW, CH);
    if (!cropImg) return;
    var s = Math.min(CW / cropImg.naturalWidth, CH / cropImg.naturalHeight);
    fit.dw = cropImg.naturalWidth * s; fit.dh = cropImg.naturalHeight * s;
    fit.dx = (CW - fit.dw) / 2; fit.dy = (CH - fit.dh) / 2;
    cropCtx.drawImage(cropImg, fit.dx, fit.dy, fit.dw, fit.dh);

    var bx = fit.dx + cropBox.x * fit.dw, by = fit.dy + cropBox.y * fit.dh;
    var bw = cropBox.w * fit.dw, bh = cropBox.h * fit.dh;
    cropCtx.save();
    if (cropBox.circle) {
      cropCtx.beginPath();
      cropCtx.arc(bx + bw / 2, by + bh / 2, Math.min(bw, bh) / 2, 0, Math.PI * 2);
      cropCtx.clip();
    } else {
      cropCtx.beginPath(); cropCtx.rect(bx, by, bw, bh); cropCtx.clip();
    }
    cropCtx.fillStyle = "rgba(11,13,19,0.55)";
    cropCtx.fillRect(fit.dx, fit.dy, fit.dw, fit.dh);
    cropCtx.drawImage(cropImg, fit.dx, fit.dy, fit.dw, fit.dh);
    cropCtx.restore();

    cropCtx.strokeStyle = "#6c8cff";
    cropCtx.lineWidth = 1.5;
    cropCtx.beginPath();
    if (cropBox.circle) cropCtx.arc(bx + bw / 2, by + bh / 2, Math.min(bw, bh) / 2, 0, Math.PI * 2);
    else cropCtx.rect(bx, by, bw, bh);
    cropCtx.stroke();
    if (!cropBox.circle) {
      cropCtx.fillStyle = "#6c8cff";
      [[bx, by], [bx + bw, by], [bx, by + bh], [bx + bw, by + bh]].forEach(function (p) {
        cropCtx.fillRect(p[0] - 4, p[1] - 4, 8, 8);
      });
    }
  }

  function updateCropPanel() {
    if (!cropPanel) return;
    if (!loadedImages.length) { cropPanel.hidden = true; cropImg = null; return; }
    cropPanel.hidden = false;
    loadImage(loadedImages[0]._url).then(function (im) {
      cropImg = im; resetCrop(); drawCrop();
    });
  }

  function mimeExt(mime) {
    return (mime.split("/")[1] || "png").replace("jpeg", "jpg");
  }

  function outputName(srcName, mime, suffix) {
    var base = (srcName || "image").replace(/\.[^.]+$/, "");
    var used = {};
    return base + (suffix || "") + "." + mimeExt(mime);
  }

  function zipImages() {
    if (!window.JSZip) return Promise.reject(new Error("JSZip missing"));
    var zip = new JSZip();
    var used = {};
    processedImages.forEach(function (r) {
      var name = r.name, n = 1;
      while (used[name]) {
        name = r.name.replace(/(\.[^.]+)$/, "_" + n + "$1");
        n++;
      }
      used[name] = 1;
      zip.file(name, r.blob);
    });
    return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  }

  async function runImages() {
    if (!loadedImages.length) { toast(t("wb.no.data")); return; }
    var opts = collectOptions();
    var cropActive = cropBox.circle || cropBox.w < 0.999 || cropBox.h < 0.999;
    var opacity = (parseInt(opts.wmOpacity, 10) || 85) / 100;
    var engineOpts = {
      format: opts.imageFormat || "original",
      quality: opts.imageQuality,
      resizeMode: opts.resizeMode || "fit",
      maxW: parseInt(opts.imageWidth, 10) || 0,
      maxH: parseInt(opts.imageHeight, 10) || 0,
      scale: opts.imageScale,
      rotation: opts.imageRotate || "0",
      flipH: !!opts.imageFlipH,
      flipV: !!opts.imageFlipV,
      grayscale: !!opts.imageGrayscale,
      crop: cropActive
        ? { x: cropBox.x, y: cropBox.y, w: cropBox.w, h: cropBox.h, circle: cropBox.circle }
        : null,
      watermark: {
        text: (opts.imageWatermark || "").trim(),
        position: opts.wmPosition || "br",
        fontSize: parseInt(opts.wmSize, 10) || 0,
        color: opts.wmColor || "#ffffff",
        opacity: opacity,
        image: wmImage
          ? { img: wmImage.img, scale: parseInt(opts.imageWmScale, 10) || 25, opacity: opacity, tile: !!opts.imageWmTile }
          : null
      }
    };

    processedImages = [];
    imagePreview.innerHTML = "";
    var totalInBytes = 0, totalOutBytes = 0;
    for (var i = 0; i < loadedImages.length; i++) {
      var item = loadedImages[i];
      totalInBytes += item.blob.size;
      var imgEl = await loadImage(item._url);
      var blob = await DFPEngine.processImage(imgEl, engineOpts, {
        orientation: item.orientation || 1,
        mime: item.blob.type
      });
      var name = outputName(item.name, blob.type, opts.imageNameSuffix || "");
      processedImages.push({ name: name, blob: blob });
      totalOutBytes += blob.size;

      var url = URL.createObjectURL(blob);
      var saved = Math.max(-99, Math.round((1 - blob.size / item.blob.size) * 100));
      var fig = document.createElement("figure");
      fig.className = "img-thumb out";
      fig.innerHTML = '<img src="' + url + '"><figcaption>' + esc(name) + "<br>"
        + (blob.size / 1024).toFixed(1) + "KB (" + (saved >= 0 ? "−" : "+") + Math.abs(saved) + "%)</figcaption>";
      imagePreview.appendChild(fig);
    }

    var summary = processedImages.length + " " + t("wb.stat.records") + " · "
      + (totalInBytes / 1024).toFixed(0) + "KB → " + (totalOutBytes / 1024).toFixed(0) + "KB";
    if (processedImages.length > 1) {
      try {
        var zipBlob = await zipImages();
        browserSave(zipBlob, "dataforge-images.zip");
        outputStat.textContent = summary + " · " + t("wb.zip.ready");
      } catch (e) {
        processedImages.forEach(function (r) { browserSave(r.blob, r.name); });
        outputStat.textContent = summary;
      }
    } else {
      browserSave(processedImages[0].blob, processedImages[0].name);
      outputStat.textContent = summary;
    }
    toast(t("wb.run") + " (" + processedImages.length + " " + t("wb.stat.records") + ")");
  }

  async function runMultifile() {
    var tables = multiTables.slice();
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
    opts.sourceColName = t("opt.sourceCol.header");
    var result;
    try {
      result = DFPEngine.mergeTables(tables, opts);
    } catch (e) {
      outputArea.value = t("wb.stat.error") + e.message;
      updateOutputStats();
      return;
    }
    /* The textarea always shows a CSV preview; the actual export is binary when xlsx. */
    outputArea.value = DFPEngine.toCSV(result);
    lastBinary = null;
    if (opts.mergeFormat === "xlsx") {
      try {
        var blob = await DFPXlsx.buildXLSX([{ name: "Merged", rows: result }]);
        lastBinary = { blob: blob, name: "merged.xlsx" };
        outputStat.textContent = result.length + " " + t("wb.stat.rows")
          + " · " + t("wb.xlsx.ready");
      } catch (e) {
        outputArea.value = t("wb.stat.error") + e.message;
        updateOutputStats();
        return;
      }
    } else {
      lastExt = "csv"; lastMime = "text/csv";
      updateOutputStats();
    }
    toast(t("wb.run") + " (" + result.length + " " + t("wb.stat.rows") + ")");
  }

  function updateOutputStats() {
    var v = outputArea.value;
    outputStat.textContent = v.length ? (v.split(/\r?\n/).length + " " + t("wb.stat.lines") + " · " + v.length + " " + t("wb.stat.chars")) : "";
  }

  /* ============================== Run Button ============================== */
  $("runBtn").addEventListener("click", async function () {
    if (tool.io === "images") { await runImages(); return; }
    if (tool.io === "multifile") { await runMultifile(); return; }
    var text = inputArea.value.trim();
    if (!text) { toast(t("wb.no.data")); return; }
    var opts = collectOptions();
    lastBinary = null;
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
  $("downloadBtn").addEventListener("click", async function () {
    if (tool.io === "images") {
      if (!processedImages.length) { toast(t("wb.no.data")); return; }
      if (processedImages.length === 1) {
        browserSave(processedImages[0].blob, processedImages[0].name);
      } else {
        try { browserSave(await zipImages(), "dataforge-images.zip"); }
        catch (e) { processedImages.forEach(function (pi) { browserSave(pi.blob, pi.name); }); }
      }
      return;
    }
    if (lastBinary) { browserSave(lastBinary.blob, lastBinary.name); return; }
    var v = outputArea.value;
    if (!v) { toast(t("wb.no.data")); return; }
    browserSave(new Blob([v], { type: lastMime }), "output." + lastExt);
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
        if (--pending === 0) { updateCropPanel(); toast(t("wb.sample") + " (" + loadedImages.length + ")"); }
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
    lastBinary = null;
    imagePreview.innerHTML = "";
    updateCropPanel();
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
  buildCropPanel();
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
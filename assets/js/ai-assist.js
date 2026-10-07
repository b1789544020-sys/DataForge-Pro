/* DataForge — AI Assist logic
 * Turns a natural-language instruction into concrete tool options, diagnoses
 * data quality, explains results, and recommends a tool.
 *
 * Two engines:
 *   - local()  : rule based, offline, always available (no key, no network)
 *   - remote() : OpenAI-compatible chat model, only when configured
 * Every suggestion is returned as a PATCH the user must explicitly apply,
 * so the deterministic core engine stays the single source of truth.
 */
window.DFPAssist = (function () {
  "use strict";

  /* ------------------------------------------------------ option schema info */
  function schemaOf(toolId) {
    var tool = window.DFP.getTool(toolId);
    return (tool && tool.options) || [];
  }

  /* Describe the option schema for the model, compactly. */
  function describeSchema(toolId) {
    return schemaOf(toolId).map(function (o) {
      var line = "- " + o.key + " (" + o.type;
      if (o.opts) line += ", one of: " + o.opts.join(" | ");
      if (o.type === "range") line += ", " + (o.min || 0) + "-" + (o.max || 100);
      line += ", default: " + JSON.stringify(o.default) + ")";
      return line;
    }).join("\n");
  }

  /* Coerce a raw model/heuristic value into the schema's type. */
  function coerce(opt, value) {
    if (opt.type === "checkbox") {
      if (typeof value === "boolean") return value;
      return /^(1|true|yes|on)$/i.test(String(value));
    }
    if (opt.type === "select") {
      var v = String(value);
      return opt.opts.indexOf(v) >= 0 ? v : null;
    }
    if (opt.type === "number" || opt.type === "range") {
      var n = parseFloat(value);
      if (isNaN(n)) return null;
      if (opt.min != null) n = Math.max(opt.min, n);
      if (opt.max != null) n = Math.min(opt.max, n);
      return n;
    }
    if (opt.type === "text") return String(value);
    return null; /* "columns" is driven by the checkbox list, never by AI */
  }

  /* Keep only keys that exist for this tool and have a valid value. */
  function sanitizePatch(toolId, patch) {
    var schema = schemaOf(toolId), clean = {}, rejected = [];
    Object.keys(patch || {}).forEach(function (k) {
      var opt = null;
      for (var i = 0; i < schema.length; i++) if (schema[i].key === k) { opt = schema[i]; break; }
      if (!opt) { rejected.push(k); return; }
      var v = coerce(opt, patch[k]);
      if (v === null || v === undefined) { rejected.push(k); return; }
      clean[k] = v;
    });
    return { patch: clean, rejected: rejected };
  }

  /* ------------------------------------------------------------ local engine */
  var RULES = [
    /* key, regex (zh + en), value */
    ["dedup", /去重|重复|duplicat|dedup|unique/i, true],
    ["trim", /空格|首尾|trim|whitespace/i, true],
    ["normalizeWhitespace", /多余空格|连续空格|规范化空白|normalize\s*whitespace|collapse\s*space/i, true],
    ["dropEmptyRows", /空行|empty\s*row|blank\s*row/i, true],
    ["removeEmptyCols", /空列|empty\s*col/i, true],
    ["stripQuotes", /引号|quote/i, true],
    ["stripHTML", /html|标签|tag/i, true],
    ["hasHeader", /表头|首行|标题行|header/i, true],
    ["pretty", /美化|格式化|缩进|pretty|beautify|indent/i, true],
    ["minify", /压缩|最小化|minif|compact|一行/i, true],
    ["sortKeys", /排序键|键排序|sort\s*key/i, true],
    ["inferTypes", /类型|推断|infer|type/i, true],
    ["createTable", /建表|create\s*table|表结构|schema/i, true],
    ["multiRow", /批量插入|多行插入|multi[- ]?row|single\s*insert/i, true],
    ["trimLines", /去空格|trim/i, true],
    ["dropEmpty", /空行|empty\s*line/i, true],
    ["number", /行号|编号|number\s*line|numbering/i, true],
    ["useRegex", /正则|regex|regexp/i, true],
    ["imageGrayscale", /灰度|黑白|grayscale|gray|b\W?w/i, true],
  ];

  var SELECT_RULES = [
    ["caseMode", [[/大写|uppercase|upper/i, "upper"], [/小写|lowercase|lower/i, "lower"]]],
    ["dateFormat", [[/年月日|ymd|yyyy-?mm-?dd|iso/i, "ymd"], [/日月年|dmy|dd\/mm/i, "dmy"]]],
    ["validateEmail", [[/删除.*邮箱|无效邮箱.*删|remove.*invalid|filter.*email/i, "remove"],
                       [/标记|校验邮箱|mark|validate\s*email/i, "mark"]]],
    ["jsonFrom", [[/json\s*(转|to|→|->)\s*csv|反向|json2csv/i, "json"], [/csv\s*(转|to|→|->)\s*json/i, "csv"]]],
    ["dialect", [[/postgre|pg\b/i, "postgres"], [/mysql|maria/i, "mysql"]]],
    ["align", [[/居中|center/i, "center"], [/右对齐|right/i, "right"], [/左对齐|left/i, "left"]]],
    ["sort", [[/降序|倒序|desc|z\s*(-|到)\s*a/i, "desc"], [/升序|排序|asc|a\s*(-|到)\s*z/i, "asc"]]],
    ["target", [[/camel/i, "camel"], [/pascal|大驼峰/i, "pascal"], [/snake|下划线/i, "snake"],
                [/kebab|中划线|短横/i, "kebab"], [/constant|常量|全大写/i, "constant"],
                [/title\s*case|标题/i, "title"], [/sentence|句首/i, "sentence"], [/toggle/i, "toggle"]]],
    ["base64Mode", [[/url\s*(解码|decode)/i, "urlDecode"], [/url\s*(编码|encode)/i, "urlEncode"],
                    [/html\s*(解码|反转义|unescape|decode)/i, "htmlDecode"],
                    [/html\s*(编码|转义|escape|encode)/i, "htmlEncode"],
                    [/解码|decode/i, "decode"], [/编码|encode/i, "encode"]]],
    ["imageFormat", [[/webp/i, "webp"], [/jpe?g/i, "jpeg"], [/png/i, "png"], [/原格式|original|保持/i, "original"]]],
    ["joinType", [[/内连接|交集|inner/i, "inner"], [/外连接|全部列|outer/i, "outer"], [/追加|纵向|union|合并/i, "union"]]],
  ];
  /* Extracts quoted / after-keyword strings for text-type options. */
  function localTextOptions(toolId, q, patch) {
    var quoted = q.match(/["“”'‘’]([^"“”'‘’]{1,60})["“”'‘’]/g) || [];
    var vals = quoted.map(function (s) { return s.replace(/^["“”'‘’]|["“”'‘’]$/g, ""); });

    if (toolId === "text-batch") {
      var rep = q.match(/(?:把|将)?\s*["“”'‘’]?([^"“”'‘’\s]{1,40})["“”'‘’]?\s*(?:替换成|替换为|改成|换成|replace(?:d)?\s+with|->|→)\s*["“”'‘’]?([^"“”'‘’\s]{0,40})/i);
      if (rep) { patch.find = rep[1]; patch.replace = rep[2] || ""; }
      else if (vals.length >= 2) { patch.find = vals[0]; patch.replace = vals[1]; }
      var pre = q.match(/(?:前缀|prefix)\s*[:：]?\s*["“”'‘’]?([^\s"“”'‘’]{1,30})/i);
      if (pre) patch.prefix = pre[1];
      var suf = q.match(/(?:后缀|suffix)\s*[:：]?\s*["“”'‘’]?([^\s"“”'‘’]{1,30})/i);
      if (suf) patch.suffix = suf[1];
    }
    if (toolId === "csv-to-sql") {
      var tn = q.match(/(?:表名|表叫|table(?:\s*name)?|into)\s*(?:是|为|叫)?\s*[:：]?\s*["“”'‘’`]?([A-Za-z_]\w{0,40})/i);
      if (tn) patch.tableName = tn[1];
      else if (vals.length) patch.tableName = vals[0].replace(/[^\w]/g, "_");
    }
    if (toolId === "csv-cleaner") {
      var fill = q.match(/(?:填充|补上|填成|fill(?:\s*empty)?(?:\s*with)?)\s*(?:为|成)?\s*[:：]?\s*["“”'‘’]?([^\s"“”'‘’]{1,20})/i);
      if (fill && !/^(空值|空|empty|blank)$/i.test(fill[1])) patch.fillEmpty = fill[1];
      var dc = q.match(/(?:按|by)\s*["“”'‘’]?([A-Za-z_\u4e00-\u9fa5][\w\u4e00-\u9fa5]{0,30})["“”'‘’]?\s*(?:这?一?列|字段|column|field)?\s*(?:去重|dedup)/i);
      if (dc) patch.dedupColumn = dc[1];
    }
    if (toolId === "image-batch") {
      var wm = q.match(/(?:水印|watermark)\s*(?:是|为|写|文字)?\s*[:：]?\s*["“”'‘’]?([^\s"“”'‘’]{1,30})/i);
      if (wm) patch.imageWatermark = wm[1];
      var w = q.match(/(?:宽度?|width)\s*[:：]?\s*(\d{2,5})/i);
      if (w) patch.imageWidth = w[1];
      var h = q.match(/(?:高度?|height)\s*[:：]?\s*(\d{2,5})/i);
      if (h) patch.imageHeight = h[1];
      var qy = q.match(/(?:质量|quality)\s*[:：]?\s*(\d{1,3})/i);
      if (qy) patch.imageQuality = qy[1];
    }
    if (toolId === "json-formatter") {
      var ind = q.match(/(?:缩进|indent)\s*[:：]?\s*(\d{1,2})/i);
      if (ind) patch.indent = ind[1];
    }
    if (toolId === "regex-tester") {
      if (/邮箱|邮件|email/i.test(q)) patch.regexPattern = "\\b[\\w.+-]+@[\\w-]+\\.[\\w.]+\\b";
      else if (/手机|电话|phone/i.test(q)) patch.regexPattern = "\\b1[3-9]\\d{9}\\b";
      else if (/网址|链接|url/i.test(q)) patch.regexPattern = "https?://[^\\s]+";
      else if (/中文|汉字|chinese/i.test(q)) patch.regexPattern = "[\\u4e00-\\u9fa5]+";
      else if (/日期|date/i.test(q)) patch.regexPattern = "\\d{4}[-/.]\\d{1,2}[-/.]\\d{1,2}";
      else if (/\bip\b/i.test(q)) patch.regexPattern = "\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b";
      else if (/数字|number/i.test(q)) patch.regexPattern = "-?\\d+(?:\\.\\d+)?";
      if (vals.length && !patch.regexPattern) patch.regexPattern = vals[0];
    }
    if (toolId === "dedup-merge") {
      var dk = q.match(/(?:按|by)\s*["“”'‘’]?([A-Za-z_\u4e00-\u9fa5][\w\u4e00-\u9fa5]{0,30})["“”'‘’]?\s*(?:这?一?列|字段|column|key)/i);
      if (dk) patch.dedupKey = dk[1];
    }
    return patch;
  }

  /* Offline intent -> option patch. */
  function localPlan(toolId, instruction) {
    var q = String(instruction || "");
    var patch = {};
    var has = {};
    schemaOf(toolId).forEach(function (o) { has[o.key] = o; });

    RULES.forEach(function (r) {
      if (has[r[0]] && r[1].test(q)) patch[r[0]] = r[2];
    });
    if (/不要去重|不用去重|保留重复|keep duplicates?|don'?t dedup/i.test(q)) delete patch.dedup;
    if (/不要压缩|不用压缩|don'?t minify/i.test(q)) delete patch.minify;
    if (/保留空行|keep empty (rows?|lines?)/i.test(q)) { delete patch.dropEmptyRows; delete patch.dropEmpty; }

    SELECT_RULES.forEach(function (sr) {
      if (!has[sr[0]]) return;
      for (var i = 0; i < sr[1].length; i++) {
        if (sr[1][i][0].test(q)) { patch[sr[0]] = sr[1][i][1]; return; }
      }
    });
    if (patch.minify === true) delete patch.pretty;

    localTextOptions(toolId, q, patch);
    var res = sanitizePatch(toolId, patch);
    return {
      source: "local",
      patch: res.patch,
      rejected: res.rejected,
      notes: Object.keys(res.patch).length ? null : "AI_LOCAL_NO_MATCH"
    };
  }

  /* ------------------------------------------- local data profiling (offline) */
  function profile(text) {
    var rows;
    try { rows = DFPEngine.parseCSV(text); } catch (e) { rows = []; }
    var p = {
      lines: String(text).split(/\r?\n/).length,
      chars: String(text).length,
      rows: rows.length,
      cols: rows.length ? rows[0].length : 0,
      header: rows.length ? rows[0].slice(0, 30) : [],
      delimiter: DFPEngine.detectDelimiter(String(text)),
      issues: [],
      columns: []
    };
    if (!rows.length) return p;

    var body = rows.slice(1);
    var seen = {}, dupRows = 0;
    body.forEach(function (r) {
      var k = r.join("\u0001");
      if (seen[k]) dupRows++; else seen[k] = 1;
    });
    var emptyRows = body.filter(function (r) { return r.every(function (c) { return c === ""; }); }).length;
    var padded = 0, htmlCells = 0, quoted = 0;
    body.forEach(function (r) {
      r.forEach(function (c) {
        if (c !== c.trim()) padded++;
        if (/<[^>]+>/.test(c)) htmlCells++;
        if (/^".*"$/.test(c)) quoted++;
      });
    });

    p.header.forEach(function (h, i) {
      var vals = body.map(function (r) { return r[i] == null ? "" : r[i]; });
      var nonEmpty = vals.filter(function (v) { return v !== ""; });
      var col = {
        name: h,
        empty: vals.length - nonEmpty.length,
        distinct: Object.keys(nonEmpty.reduce(function (a, v) { a[v] = 1; return a; }, {})).length,
        numeric: nonEmpty.length > 0 && nonEmpty.every(function (v) { return /^-?\d+(\.\d+)?$/.test(v); }),
        looksEmail: /e-?mail/i.test(h) || nonEmpty.slice(0, 20).some(function (v) { return v.indexOf("@") > 0; }),
        looksDate: nonEmpty.slice(0, 20).some(function (v) { return /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$|^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}$/.test(v); })
      };
      if (col.looksEmail) {
        col.invalidEmails = nonEmpty.filter(function (v) { return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }).length;
      }
      if (col.looksDate) {
        var fmts = {};
        nonEmpty.forEach(function (v) {
          if (/^\d{4}[-/.]/.test(v)) fmts.ymd = 1;
          else if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}$/.test(v)) fmts.dmy = 1;
        });
        col.mixedDateFormats = Object.keys(fmts).length > 1;
      }
      p.columns.push(col);
    });

    /* Issues, each carrying the option patch that fixes it. */
    if (dupRows) p.issues.push({ code: "dupRows", n: dupRows, fix: { dedup: true } });
    if (emptyRows) p.issues.push({ code: "emptyRows", n: emptyRows, fix: { dropEmptyRows: true } });
    if (padded) p.issues.push({ code: "padded", n: padded, fix: { trim: true } });
    if (htmlCells) p.issues.push({ code: "html", n: htmlCells, fix: { stripHTML: true } });
    if (quoted) p.issues.push({ code: "quoted", n: quoted, fix: { stripQuotes: true } });
    var emptyCols = p.columns.filter(function (c) { return c.empty === body.length; }).length;
    if (emptyCols) p.issues.push({ code: "emptyCols", n: emptyCols, fix: { removeEmptyCols: true } });
    var badEmails = p.columns.reduce(function (a, c) { return a + (c.invalidEmails || 0); }, 0);
    if (badEmails) p.issues.push({ code: "badEmails", n: badEmails, fix: { validateEmail: "mark" } });
    var mixedDates = p.columns.filter(function (c) { return c.mixedDateFormats; }).length;
    if (mixedDates) p.issues.push({ code: "mixedDates", n: mixedDates, fix: { dateFormat: "ymd" } });
    var partialEmpty = p.columns.filter(function (c) { return c.empty > 0 && c.empty < body.length; }).length;
    if (partialEmpty) p.issues.push({ code: "missingValues", n: partialEmpty, fix: {} });
    return p;
  }

  /* Merge every issue fix that this tool actually supports. */
  function fixPatchFor(toolId, prof) {
    var merged = {};
    (prof.issues || []).forEach(function (it) {
      for (var k in it.fix) merged[k] = it.fix[k];
    });
    return sanitizePatch(toolId, merged).patch;
  }

  /* --------------------------------------------- local tool recommendation */
  var TOOL_HINTS = {
    "csv-cleaner": /清洗|清理|脏|去重|空格|空行|规范|clean|dedup|tidy|messy|trim/i,
    "column-extractor": /列|字段|提取|挑选|删除列|column|field|extract|select/i,
    "dedup-merge": /合并|多个文件|多表|汇总|merge|combine|multiple files|join/i,
    "csv-to-json": /json/i,
    "csv-to-sql": /sql|数据库|insert|建表|mysql|postgre/i,
    "csv-to-markdown": /markdown|md\b|readme|文档表格/i,
    "json-formatter": /格式化|美化|校验|压缩|validate|beautify|format|minify/i,
    "base64-tool": /base64|url\s*编|编码|解码|转义|encode|decode|escape/i,
    "text-batch": /替换|批量|行号|前缀|后缀|排序|replace|prefix|suffix|lines?/i,
    "case-converter": /命名|驼峰|下划线|大小写|camel|snake|kebab|pascal|case/i,
    "regex-tester": /正则|匹配|提取模式|regex|pattern|match/i,
    "image-batch": /图片|图像|压缩图|水印|缩放|尺寸|image|photo|watermark|resize|webp|jpe?g|png/i
  };

  function localRecommend(query) {
    var q = String(query || "");
    var scored = [];
    window.DFP.TOOLS.forEach(function (tool) {
      var score = 0;
      var re = TOOL_HINTS[tool.id];
      if (re && re.test(q)) score += 3;
      var name = window.DFP.t("tool." + tool.id + ".name").toLowerCase();
      if (q && name.indexOf(q.toLowerCase()) >= 0) score += 2;
      if (score) scored.push({ id: tool.id, score: score });
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    return {
      source: "local",
      picks: scored.slice(0, 3).map(function (s) {
        return { id: s.id, why: window.DFP.lang === "zh" ? "关键词匹配" : "keyword match" };
      })
    };
  }

  /* ----------------------------------------------------------- remote engine */
  function langName() { return window.DFP.lang === "zh" ? "Chinese" : "English"; }

  function planPrompt(toolId, instruction, sample) {
    var toolName = window.DFP.t("tool." + toolId + ".name");
    return [
      {
        role: "system",
        content:
          "You configure a deterministic, offline data tool. You never transform the data yourself.\n" +
          "Return ONLY a JSON object: {\"options\":{...},\"explain\":\"...\",\"warnings\":[\"...\"]}\n" +
          "- options: only keys from the given schema, values matching the declared type/enum. Omit keys that should keep their current value.\n" +
          "- explain: one or two short sentences in " + langName() + " describing what will happen.\n" +
          "- warnings: optional short cautions (e.g. irreversible removal).\n" +
          "No markdown, no prose outside the JSON."
      },
      {
        role: "user",
        content:
          "TOOL: " + toolId + " (" + toolName + ")\n" +
          "OPTION SCHEMA:\n" + describeSchema(toolId) + "\n\n" +
          "DATA SAMPLE (may be truncated/masked):\n```\n" + sample + "\n```\n\n" +
          "USER INSTRUCTION:\n" + instruction
      }
    ];
  }

  function remotePlan(toolId, instruction, text) {
    var sample = window.DFPAI.buildSample(text);
    return window.DFPAI.chat(planPrompt(toolId, instruction, sample), { json: true })
      .then(function (raw) {
        var obj = window.DFPAI.parseJSONLoose(raw);
        var res = sanitizePatch(toolId, obj.options || {});
        return {
          source: "remote",
          patch: res.patch,
          rejected: res.rejected,
          explain: obj.explain || "",
          warnings: Array.isArray(obj.warnings) ? obj.warnings : []
        };
      });
  }

  function diagnosePrompt(toolId, prof, sample) {
    return [
      {
        role: "system",
        content:
          "You are a data-quality reviewer for an offline toolkit. Answer in " + langName() + ".\n" +
          "Return ONLY JSON: {\"summary\":\"...\",\"findings\":[\"...\"],\"options\":{...}}\n" +
          "- summary: 1-2 sentences about the shape and quality of the data.\n" +
          "- findings: up to 5 concrete problems, mentioning column names.\n" +
          "- options: recommended settings for THIS tool's schema only (may be empty)."
      },
      {
        role: "user",
        content:
          "TOOL: " + toolId + "\nOPTION SCHEMA:\n" + describeSchema(toolId) +
          "\n\nLOCAL PROFILE (computed in browser):\n" +
          JSON.stringify({ rows: prof.rows, cols: prof.cols, delimiter: prof.delimiter,
                           header: prof.header, columns: prof.columns,
                           issues: prof.issues }, null, 1) +
          "\n\nDATA SAMPLE:\n```\n" + sample + "\n```"
      }
    ];
  }

  function remoteDiagnose(toolId, text) {
    var prof = profile(text);
    var sample = window.DFPAI.buildSample(text);
    return window.DFPAI.chat(diagnosePrompt(toolId, prof, sample), { json: true })
      .then(function (raw) {
        var obj = window.DFPAI.parseJSONLoose(raw);
        var res = sanitizePatch(toolId, obj.options || {});
        return {
          source: "remote",
          profile: prof,
          summary: obj.summary || "",
          findings: Array.isArray(obj.findings) ? obj.findings : [],
          patch: res.patch
        };
      });
  }

  function remoteExplain(toolId, opts, inputText, outputText) {
    var msgs = [
      {
        role: "system",
        content: "Explain a completed local data transformation in " + langName() +
          ". Plain text, max 4 short lines each starting with '- '. " +
          "Say what changed and flag anything that looks wrong. No markdown headings."
      },
      {
        role: "user",
        content:
          "TOOL: " + toolId + "\nOPTIONS USED: " + JSON.stringify(opts) +
          "\n\nINPUT SAMPLE:\n```\n" + window.DFPAI.buildSample(inputText) + "\n```" +
          "\n\nOUTPUT SAMPLE:\n```\n" + window.DFPAI.buildSample(outputText) + "\n```"
      }
    ];
    return window.DFPAI.chat(msgs).then(function (t) {
      return { source: "remote", text: String(t).trim() };
    });
  }

  function remoteRecommend(query) {
    var list = window.DFP.TOOLS.map(function (t) {
      return "- " + t.id + ": " + window.DFP.t("tool." + t.id + ".name") +
             " — " + window.DFP.t("tool." + t.id + ".desc");
    }).join("\n");
    var msgs = [
      {
        role: "system",
        content: "Pick the best tools for the user's task. Return ONLY JSON: " +
          "{\"picks\":[{\"id\":\"tool-id\",\"why\":\"one short sentence in " + langName() + "\"}]} " +
          "with at most 3 picks, ids copied verbatim from the list."
      },
      { role: "user", content: "AVAILABLE TOOLS:\n" + list + "\n\nTASK:\n" + query }
    ];
    return window.DFPAI.chat(msgs, { json: true }).then(function (raw) {
      var obj = window.DFPAI.parseJSONLoose(raw);
      var valid = (obj.picks || []).filter(function (p) { return !!window.DFP.getTool(p.id); });
      return { source: "remote", picks: valid.slice(0, 3) };
    });
  }

  /* --------------------------------------------------------------- dispatcher
   * Each entry point uses the model when configured and always falls back to the
   * offline rules, so the feature is never a dead end.
   */
  function plan(toolId, instruction, text) {
    if (!window.DFPAI.isConfigured()) return Promise.resolve(localPlan(toolId, instruction));
    return remotePlan(toolId, instruction, text).catch(function (err) {
      var l = localPlan(toolId, instruction);
      l.fallbackError = err.message;
      return l;
    });
  }

  function diagnose(toolId, text) {
    var local = { source: "local", profile: profile(text), summary: "", findings: [] };
    local.patch = fixPatchFor(toolId, local.profile);
    if (!window.DFPAI.isConfigured()) return Promise.resolve(local);
    return remoteDiagnose(toolId, text).catch(function (err) {
      local.fallbackError = err.message;
      return local;
    });
  }

  function explain(toolId, opts, inputText, outputText) {
    if (!window.DFPAI.isConfigured()) {
      return Promise.resolve({ source: "local", text: "AI_EXPLAIN_NEEDS_MODEL" });
    }
    return remoteExplain(toolId, opts, inputText, outputText);
  }

  function recommend(query) {
    if (!window.DFPAI.isConfigured()) return Promise.resolve(localRecommend(query));
    return remoteRecommend(query).catch(function (err) {
      var l = localRecommend(query);
      l.fallbackError = err.message;
      return l;
    });
  }

  return {
    schemaOf: schemaOf,
    describeSchema: describeSchema,
    sanitizePatch: sanitizePatch,
    profile: profile,
    fixPatchFor: fixPatchFor,
    localPlan: localPlan,
    localRecommend: localRecommend,
    plan: plan,
    diagnose: diagnose,
    explain: explain,
    recommend: recommend
  };
})();


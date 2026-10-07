/* DataForge Pro — Core Engine (v2, professional-grade)
 * All data processing happens here, 100% in-browser. No network calls.
 */
window.DFPEngine = (function () {

  /* ---------------- CSV parsing (RFC-4180 aware, auto-delimiter) ---------------- */
  function detectDelimiter(text) {
    const firstLine = (text.split(/\r?\n/)[0] || "");
    const counts = {
      ",": (firstLine.match(/,/g) || []).length,
      "\t": (firstLine.match(/\t/g) || []).length,
      ";": (firstLine.match(/;/g) || []).length,
      "|": (firstLine.match(/\|/g) || []).length,
    };
    let best = ",", max = -1;
    for (const d in counts) { if (counts[d] > max) { max = counts[d]; best = d; } }
    return max > 0 ? best : ",";
  }

  function parseCSV(text, delimiter) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // strip BOM
    delimiter = delimiter || detectDelimiter(text);
    const rows = [];
    let row = [], field = "", inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i], next = text[i + 1];
      if (inQuotes) {
        if (c === '"' && next === '"') { field += '"'; i++; }
        else if (c === '"') { inQuotes = false; }
        else { field += c; }
      } else {
        if (c === '"') { inQuotes = true; }
        else if (c === delimiter) { row.push(field); field = ""; }
        else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
        else if (c === "\r") { /* ignore */ }
        else { field += c; }
      }
    }
    if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
    const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
    rows.forEach(r => { while (r.length < width) r.push(""); });
    return rows.filter(r => r.length > 1 || (r.length === 1 && r[0] !== ""));
  }

  function toCSV(rows, delimiter) {
    delimiter = delimiter || ",";
    return rows.map(r => r.map(cell => {
      const s = String(cell == null ? "" : cell);
      return /[",\n\r]/.test(s) || s.includes(delimiter)
        ? '"' + s.replace(/"/g, '""') + '"'
        : s;
    }).join(delimiter)).join("\n");
  }

  function rowsToObjects(rows) {
    if (!rows.length) return [];
    const header = rows[0];
    return rows.slice(1).map(r => {
      const o = {};
      header.forEach((h, i) => { o[h] = r[i] !== undefined ? r[i] : ""; });
      return o;
    });
  }

  /* ---------------- Type inference ---------------- */
  function inferValue(v) {
    if (v === "" || v == null) return v;
    if (/^-?\d+$/.test(v)) return parseInt(v, 10);
    if (/^-?\d*\.\d+$/.test(v)) return parseFloat(v);
    if (/^(true|false)$/i.test(v)) return /true/i.test(v);
    return v;
  }

  /* ---------------- Cleaner helpers ---------------- */
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function normalizeDate(v, mode) {
    if (!v) return v;
    let y, m, d, match;
    if ((match = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) {
      y = match[1]; m = match[2]; d = match[3];
    } else if ((match = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) {
      d = match[1]; m = match[2]; y = match[3];
    } else {
      const parsed = new Date(v);
      if (isNaN(parsed.getTime())) return v;
      y = parsed.getFullYear(); m = parsed.getMonth() + 1; d = parsed.getDate();
    }
    const pad = n => String(n).padStart(2, "0");
    if (mode === "ymd") return `${y}-${pad(m)}-${pad(d)}`;
    if (mode === "dmy") return `${pad(d)}/${pad(m)}/${y}`;
    return v;
  }

  /* ---------------- CSV Cleaner (13 operations) ---------------- */
  function cleanCSV(rows, opts) {
    let out = rows.map(r => r.slice());
    const headerRow = opts.hasHeader ? out[0] : null;
    let body = opts.hasHeader ? out.slice(1) : out;

    if (opts.stripQuotes) {
      const strip = c => c.replace(/^"(.*)"$/s, "$1").replace(/^'(.*)'$/s, "$1");
      body = body.map(r => r.map(strip));
      if (headerRow) for (let i = 0; i < headerRow.length; i++) headerRow[i] = strip(headerRow[i]);
    }
    if (opts.stripHTML) {
      const strip = c => c.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ");
      body = body.map(r => r.map(strip));
    }
    if (opts.normalizeWhitespace) {
      body = body.map(r => r.map(c => c.replace(/[ \t]+/g, " ")));
    }
    if (opts.trim) {
      body = body.map(r => r.map(c => c.trim()));
      if (headerRow) for (let i = 0; i < headerRow.length; i++) headerRow[i] = headerRow[i].trim();
    }
    if (opts.caseMode === "upper") body = body.map(r => r.map(c => c.toUpperCase()));
    else if (opts.caseMode === "lower") body = body.map(r => r.map(c => c.toLowerCase()));

    if (opts.dateFormat && opts.dateFormat !== "none") {
      body = body.map(r => r.map(c => normalizeDate(c, opts.dateFormat)));
    }

    if (opts.validateEmail && opts.validateEmail !== "off") {
      const emailColIdx = headerRow ? headerRow.findIndex(h => /e-?mail/i.test(h)) : -1;
      if (opts.validateEmail === "mark") {
        body = body.map(r => r.map((c, i) => {
          if (emailColIdx >= 0 ? i === emailColIdx : /@/.test(c)) {
            return c !== "" && !EMAIL_RE.test(c) ? "[INVALID] " + c : c;
          }
          return c;
        }));
      } else if (opts.validateEmail === "remove") {
        body = body.filter(r => {
          if (emailColIdx >= 0) return r[emailColIdx] === "" || EMAIL_RE.test(r[emailColIdx]);
          return r.every(c => !/@/.test(c) || EMAIL_RE.test(c));
        });
      }
    }

    if (opts.fillEmpty && opts.fillEmpty !== "") {
      body = body.map(r => r.map(c => c === "" ? opts.fillEmpty : c));
    }
    if (opts.dropEmptyRows) body = body.filter(r => r.some(c => c !== ""));

    if (opts.dedup || (opts.dedupColumn && opts.dedupColumn !== "")) {
      const colIdx = (opts.dedupColumn && headerRow) ? headerRow.indexOf(opts.dedupColumn) : -1;
      const seen = new Set(), result = [];
      body.forEach(r => {
        const key = colIdx >= 0 ? r[colIdx] : r.join("\u0001");
        if (!seen.has(key)) { seen.add(key); result.push(r); }
      });
      body = result;
    }

    out = headerRow ? [headerRow, ...body] : body;

    if (opts.removeEmptyCols && out.length) {
      const width = out[0].length;
      const keep = [];
      for (let c = 0; c < width; c++) {
        const dataHasValue = (headerRow ? out.slice(1) : out).some(r => (r[c] || "") !== "");
        if (dataHasValue) keep.push(c);
      }
      out = out.map(r => keep.map(c => r[c]));
    }
    return out;
  }

  /* ---------------- CSV <-> JSON ---------------- */
  function csvToJSON(rows, opts) {
    const objs = rowsToObjects(rows);
    const typed = opts.inferTypes
      ? objs.map(o => { const n = {}; for (const k in o) n[k] = inferValue(o[k]); return n; })
      : objs;
    return JSON.stringify(typed, null, opts.pretty ? 2 : 0);
  }

  function jsonToCSV(jsonText) {
    const data = JSON.parse(jsonText);
    const arr = Array.isArray(data) ? data : [data];
    const keys = [];
    arr.forEach(o => Object.keys(o).forEach(k => { if (!keys.includes(k)) keys.push(k); }));
    const rows = [keys, ...arr.map(o => keys.map(k => {
      const v = o[k];
      return v == null ? "" : (typeof v === "object" ? JSON.stringify(v) : v);
    }))];
    return toCSV(rows);
  }

  /* ---------------- CSV -> SQL ---------------- */
  function csvToSQL(rows, opts) {
    if (!rows.length) return "";
    const header = rows[0];
    const body = rows.slice(1);
    const table = opts.tableName || "my_table";
    const q = opts.dialect === "mysql" ? "`" : '"';
    const cols = header.map(h => q + h.trim() + q);
    let sql = "";

    if (opts.createTable) {
      const defs = header.map((h, hi) => {
        const sample = body.map(r => r[hi]).find(v => v !== "" && v !== undefined);
        let type = "TEXT";
        if (sample !== undefined && /^-?\d+$/.test(sample)) type = "INTEGER";
        else if (sample !== undefined && /^-?\d*\.\d+$/.test(sample)) type = "REAL";
        return `  ${q}${h.trim()}${q} ${type}`;
      });
      sql += `CREATE TABLE ${q}${table}${q} (\n${defs.join(",\n")}\n);\n\n`;
    }

    const values = body.map(r => {
      const vals = header.map((_, i) => {
        const v = r[i] === undefined ? "" : r[i];
        if (v === "") return "NULL";
        if (/^-?\d+(\.\d+)?$/.test(v)) return v;
        return "'" + String(v).replace(/'/g, "''") + "'";
      });
      return `(${vals.join(", ")})`;
    });

    if (opts.multiRow) {
      sql += `INSERT INTO ${q}${table}${q} (${cols.join(", ")}) VALUES\n${values.join(",\n")};`;
    } else {
      sql += values.map(v => `INSERT INTO ${q}${table}${q} (${cols.join(", ")}) VALUES ${v};`).join("\n");
    }
    return sql;
  }

  /* ---------------- Table -> Markdown ---------------- */
  function toMarkdown(rows, opts) {
    if (!rows.length) return "";
    const header = rows[0];
    const body = rows.slice(1);
    const align = opts.align || "left";
    const sep = header.map(() => {
      if (align === "center") return ":---:";
      if (align === "right") return "---:";
      return ":---";
    });
    const esc = c => String(c == null ? "" : c).replace(/\|/g, "\\|").replace(/\n/g, " ");
    const line = arr => "| " + arr.map(esc).join(" | ") + " |";
    return [line(header), "| " + sep.join(" | ") + " |", ...body.map(line)].join("\n");
  }

  /* ---------------- JSON Formatter ---------------- */
  function formatJSON(text, opts) {
    const data = JSON.parse(text);
    const replacer = opts.sortKeys
      ? (function () {
          const allKeys = new Set();
          JSON.stringify(data, (k, v) => { allKeys.add(k); return v; });
          return Array.from(allKeys).sort();
        })()
      : null;
    if (opts.minify) return JSON.stringify(data, replacer);
    const indent = opts.indent != null ? parseInt(opts.indent, 10) : 2;
    return JSON.stringify(data, replacer, indent);
  }

  /* ---------------- Text Batch ---------------- */
  function textBatch(text, opts) {
    let lines = text.split(/\r?\n/);

    if (opts.find && opts.find !== "") {
      if (opts.useRegex) {
        const re = new RegExp(opts.find, "g");
        lines = lines.map(l => l.replace(re, opts.replace || ""));
      } else {
        lines = lines.map(l => l.split(opts.find).join(opts.replace || ""));
      }
    }
    if (opts.trimLines) lines = lines.map(l => l.trim());
    if (opts.dropEmpty) lines = lines.filter(l => l !== "");
    if (opts.sort === "asc") lines.sort((a, b) => a.localeCompare(b));
    else if (opts.sort === "desc") lines.sort((a, b) => b.localeCompare(a));
    if (opts.prefix) lines = lines.map(l => opts.prefix + l);
    if (opts.suffix) lines = lines.map(l => l + opts.suffix);
    if (opts.number) {
      const w = String(lines.length).length;
      lines = lines.map((l, i) => String(i + 1).padStart(w, " ") + ". " + l);
    }
    return lines.join("\n");
  }

  /* ---------------- Column Extractor ---------------- */
  function extractColumns(rows, opts) {
    if (!rows.length) return rows;
    const header = rows[0];
    const selected = opts.selected || header.map((_, i) => i);
    const renames = opts.renames || {};
    const newHeader = selected.map(i => renames[i] || header[i]);
    const out = [newHeader];
    rows.slice(1).forEach(r => out.push(selected.map(i => r[i] !== undefined ? r[i] : "")));
    return out;
  }

  /* ---------------- Multi-table Merge / Dedup ---------------- */
  function mergeTables(tables, opts) {
    if (!tables.length) return [];
    const joinType = opts.joinType || "union";
    let header, body = [];

    if (joinType === "inner") {
      // keep only columns present in ALL tables
      const headerSets = tables.map(t => t[0]);
      header = headerSets[0].filter(h => headerSets.every(hs => hs.includes(h)));
      tables.forEach(t => {
        const idx = header.map(h => t[0].indexOf(h));
        t.slice(1).forEach(r => body.push(idx.map(i => r[i] !== undefined ? r[i] : "")));
      });
    } else {
      // union / outer: superset of all columns
      header = [];
      tables.forEach(t => t[0].forEach(h => { if (!header.includes(h)) header.push(h); }));
      tables.forEach(t => {
        const idx = header.map(h => t[0].indexOf(h));
        t.slice(1).forEach(r => body.push(idx.map(i => i >= 0 && r[i] !== undefined ? r[i] : "")));
      });
    }

    // Dedup by key column
    if (opts.dedupKey && opts.dedupKey !== "") {
      const colIdx = header.indexOf(opts.dedupKey);
      if (colIdx >= 0) {
        const seen = new Set(), result = [];
        body.forEach(r => { if (!seen.has(r[colIdx])) { seen.add(r[colIdx]); result.push(r); } });
        body = result;
      }
    }
    return [header, ...body];
  }

  /* ---------------- Case Converter ---------------- */
  function splitWords(s) {
    return s
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[_\-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean);
  }

  function convertCase(text, target) {
    return text.split(/\r?\n/).map(line => {
      if (line.trim() === "") return line;
      const words = splitWords(line);
      const lower = words.map(w => w.toLowerCase());
      switch (target) {
        case "camel": return lower.map((w, i) => i === 0 ? w : w[0].toUpperCase() + w.slice(1)).join("");
        case "pascal": return lower.map(w => w[0].toUpperCase() + w.slice(1)).join("");
        case "snake": return lower.join("_");
        case "kebab": return lower.join("-");
        case "constant": return lower.join("_").toUpperCase();
        case "space": return lower.join(" ");
        case "title": return lower.map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
        case "sentence": return lower.map((w, i) => i === 0 ? w[0].toUpperCase() + w.slice(1) : w).join(" ");
        case "toggle": return line.split("").map(c => c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()).join("");
        default: return line;
      }
    }).join("\n");
  }

  /* ---------------- Regex Tester ---------------- */
  function regexTest(pattern, flags, text, replacement) {
    const re = new RegExp(pattern, flags || "");
    const matches = [];
    if (flags && flags.includes("g")) {
      let m;
      const reg = new RegExp(pattern, flags);
      while ((m = reg.exec(text)) !== null) {
        matches.push({ match: m[0], index: m.index, groups: m.slice(1) });
        if (m.index === reg.lastIndex) reg.lastIndex++;
      }
    } else {
      const m = re.exec(text);
      if (m) matches.push({ match: m[0], index: m.index, groups: m.slice(1) });
    }
    const result = {
      count: matches.length,
      matches: matches,
      replaced: replacement != null && replacement !== ""
        ? text.replace(new RegExp(pattern, flags || ""), replacement)
        : null,
    };
    return result;
  }

  /* ---------------- Base64 / URL / HTML Codec ---------------- */
  function b64EncodeUnicode(str) {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
      (_, p1) => String.fromCharCode("0x" + p1)));
  }
  function b64DecodeUnicode(str) {
    return decodeURIComponent(Array.prototype.map.call(atob(str),
      c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join(""));
  }
  function codec(text, mode) {
    switch (mode) {
      case "encode": return b64EncodeUnicode(text);
      case "decode": return b64DecodeUnicode(text);
      case "urlEncode": return encodeURIComponent(text);
      case "urlDecode": return decodeURIComponent(text);
      case "htmlEncode": {
        const amp = String.fromCharCode(38);   // &
        const lt = String.fromCharCode(60);    // <
        const gt = String.fromCharCode(62);    // >
        return text
          .replace(/&/g, amp + "amp;")
          .replace(/</g, amp + "lt;")
          .replace(/>/g, amp + "gt;")
          .replace(/"/g, amp + "quot;")
          .replace(/'/g, amp + "#39;");
      }
      case "htmlDecode": {
        const amp = String.fromCharCode(38);
        return text
          .replace(new RegExp(amp + "lt;", "g"), "<")
          .replace(new RegExp(amp + "gt;", "g"), ">")
          .replace(new RegExp(amp + "quot;", "g"), '"')
          .replace(new RegExp(amp + "#39;", "g"), "'")
          .replace(new RegExp(amp + "amp;", "g"), "&");
      }
      default: return text;
    }
  }

  /* ---------------- Public API ---------------- */
  return {
    detectDelimiter, parseCSV, toCSV, rowsToObjects, inferValue,
    cleanCSV, csvToJSON, jsonToCSV, csvToSQL, toMarkdown,
    formatJSON, textBatch, extractColumns, mergeTables,
    convertCase, regexTest, codec,
  };
})();

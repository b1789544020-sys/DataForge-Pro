/* DataForge Pro — Zero-dependency XLSX reader & writer
 * xlsx = ZIP container + XML. Modern browsers ship everything we need:
 *   DecompressionStream / CompressionStream ('deflate-raw') for the ZIP body,
 *   DOMParser for the XML. No SheetJS, no CDN, works fully offline.
 *
 * Public API:
 *   DFPXlsx.parseXLSX(arrayBuffer) -> { sheets: [{ name, rows: [[...], ...] }] }
 *       rows is a raw 2-D array; the first row is the sheet header.
 *   DFPXlsx.buildXLSX(sheets)      -> Promise<Blob>
 *       sheets = [{ name, rows }] (a single {name, rows} object also works).
 *   DFPXlsx.zipCreateText(files)   -> Promise<Blob>  files = [{name, text}]
 *
 * The legacy binary .xls (BIFF) format is intentionally unsupported.
 */
window.DFPXlsx = (function () {
  "use strict";

  function u16(dv, p) { return dv.getUint16(p, true); }
  function u32(dv, p) { return dv.getUint32(p, true); }

  /* ============================ ZIP reading ============================ */

  // Read the central directory by scanning backwards for the EOCD signature.
  function zipEntries(buf) {
    const dv = new DataView(buf);
    const bytes = new Uint8Array(buf);
    let eocd = -1;
    const min = Math.max(0, bytes.length - 66560); // tolerate up to 64KB comment
    for (let i = bytes.length - 22; i >= min; i--) {
      if (u32(dv, i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("Invalid ZIP/XLSX file (EOCD signature not found)");

    let count = u16(dv, eocd + 10);
    let cdOff = u32(dv, eocd + 16);

    // ZIP64: real values live in the ZIP64 EOCD record when fields are maxed.
    if (count === 0xFFFF || cdOff === 0xFFFFFFFF) {
      for (let i = eocd - 20; i >= min; i--) {
        if (u32(dv, i) === 0x07064b50) {                 // ZIP64 EOCD locator
          const z64 = Number(dv.getBigUint64(i + 8, true));
          if (u32(dv, z64) === 0x06064b50) {
            count = Number(dv.getBigUint64(z64 + 32, true));
            cdOff = Number(dv.getBigUint64(z64 + 48, true));
          }
          break;
        }
      }
    }

    const entries = {};
    let p = cdOff;
    for (let k = 0; k < count; k++) {
      if (u32(dv, p) !== 0x02014b50) break;              // central file header
      const method = u16(dv, p + 10);
      const csize = u32(dv, p + 20);
      const nameLen = u16(dv, p + 28);
      const extraLen = u16(dv, p + 30);
      const cmtLen = u16(dv, p + 32);
      const lho = u32(dv, p + 42);                       // local header offset
      const name = new TextDecoder("utf-8").decode(bytes.subarray(p + 46, p + 46 + nameLen));
      entries[name] = { method: method, csize: csize, lho: lho };
      p += 46 + nameLen + extraLen + cmtLen;
    }
    return { dv: dv, bytes: bytes, entries: entries };
  }

  async function inflateRaw(chunk) {
    const ds = new DecompressionStream("deflate-raw");
    const writer = ds.writable.getWriter();
    writer.write(chunk);
    writer.close();
    return new Uint8Array(await new Response(ds.readable).arrayBuffer());
  }

  async function zipReadText(zip, name) {
    const e = zip.entries[name];
    if (!e) return null;
    const dv = zip.dv;
    if (u32(dv, e.lho) !== 0x04034b50) throw new Error("Corrupt ZIP local header: " + name);
    const nameLen = u16(dv, e.lho + 26);
    const extraLen = u16(dv, e.lho + 28);
    const start = e.lho + 30 + nameLen + extraLen;
    let csize = e.csize;                                  // streaming writers may put 0 locally
    if (!csize) csize = u32(dv, e.lho + 18);
    const raw = zip.bytes.subarray(start, start + csize);

    let out;
    if (e.method === 0) out = raw;                        // stored
    else if (e.method === 8) out = await inflateRaw(raw);
    else throw new Error("Unsupported ZIP compression method=" + e.method);
    return new TextDecoder("utf-8").decode(out);
  }

  /* ============================ XLSX parsing ============================ */

  // Column letters -> 0-based index: A->0, Z->25, AA->26
  function colToIndex(ref) {
    let n = 0;
    for (let i = 0; i < ref.length; i++) {
      const c = ref.charCodeAt(i);
      if (c < 65 || c > 90) break;
      n = n * 26 + (c - 64);
    }
    return n - 1;
  }

  // Excel serial date -> YYYY-MM-DD (the 1900 leap-year bug means serials
  // below 60 need a +1 compensation).
  function excelSerialToDate(sn) {
    const days = Math.floor(sn);
    const ms = Math.round((sn - days) * 86400) * 1000;
    const epoch = Date.UTC(1899, 11, 30);
    const d = new Date(epoch + (days < 60 ? days + 1 : days) * 86400000 + ms);
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    if (ms > 0) {
      const hh = String(d.getUTCHours()).padStart(2, "0");
      const mi = String(d.getUTCMinutes()).padStart(2, "0");
      const ss = String(d.getUTCSeconds()).padStart(2, "0");
      return y + "-" + mo + "-" + dd + " " + hh + ":" + mi + ":" + ss;
    }
    return y + "-" + mo + "-" + dd;
  }

  function parseXml(xml) {
    return new DOMParser().parseFromString(xml, "application/xml");
  }

  // Shared string table: an <si> may hold several <t> runs - concatenate.
  function parseSharedStrings(xml) {
    if (!xml) return [];
    const doc = parseXml(xml);
    return Array.from(doc.getElementsByTagName("si")).map(function (si) {
      const ts = si.getElementsByTagName("t");
      let s = "";
      for (let i = 0; i < ts.length; i++) s += ts[i].textContent;
      return s;
    });
  }

  // Figure out which style indices are date formats.
  function parseDateStyles(xml) {
    const dateStyles = new Set();
    if (!xml) return dateStyles;
    const doc = parseXml(xml);
    const builtin = new Set([14, 15, 16, 17, 22, 27, 30, 36, 45, 46, 47, 50, 57, 58]);
    const customDate = new Set();
    Array.from(doc.getElementsByTagName("numFmt")).forEach(function (nf) {
      const id = parseInt(nf.getAttribute("numFmtId"), 10);
      const code = (nf.getAttribute("formatCode") || "").toLowerCase();
      if (/[ymdh]/.test(code) && !/[#?]/.test(code)) customDate.add(id);
    });
    const xfs = doc.getElementsByTagName("cellXfs")[0];
    if (!xfs) return dateStyles;
    Array.from(xfs.getElementsByTagName("xf")).forEach(function (xf, i) {
      const id = parseInt(xf.getAttribute("numFmtId") || "0", 10);
      if (builtin.has(id) || customDate.has(id)) dateStyles.add(i);
    });
    return dateStyles;
  }

  // Worksheet XML -> raw 2-D rows (sparse gaps filled with "").
  function sheetToRows(xml, shared, dateStyles) {
    const doc = parseXml(xml);
    const rowEls = doc.getElementsByTagName("row");
    const out = [];
    let maxCols = 0;

    for (let ri = 0; ri < rowEls.length; ri++) {
      const cells = rowEls[ri].getElementsByTagName("c");
      const row = [];
      for (let ci = 0; ci < cells.length; ci++) {
        const c = cells[ci];
        const ref = c.getAttribute("r") || "";
        const idx = ref ? colToIndex(ref) : row.length;
        const t = c.getAttribute("t");
        let val = "";

        if (t === "inlineStr") {
          const is = c.getElementsByTagName("is")[0];
          val = is ? is.textContent : "";
        } else {
          const vEl = c.getElementsByTagName("v")[0];
          const raw = vEl ? vEl.textContent : "";
          if (t === "s") {
            val = shared[parseInt(raw, 10)] || "";
          } else if (t === "e" || t === "str") {
            val = raw;
          } else if (t === "b") {
            val = raw === "1" ? "TRUE" : "FALSE";
          } else {
            const s = parseInt(c.getAttribute("s") || "-1", 10);
            if (raw !== "" && dateStyles.has(s) && isFinite(+raw) && +raw > 0) {
              val = excelSerialToDate(+raw);
            } else {
              val = raw;
            }
          }
        }
        if (idx >= 0) row[idx] = val;
      }
      for (let k = 0; k < row.length; k++) if (row[k] == null) row[k] = "";
      if (row.length > maxCols) maxCols = row.length;
      out.push(row);
    }
    out.forEach(function (r) { while (r.length < maxCols) r.push(""); });
    return out.filter(function (r) {
      return r.some(function (v) { return String(v).trim() !== ""; });
    });
  }

  async function parseXLSX(buf) {
    const zip = zipEntries(buf);
    const wbXml = await zipReadText(zip, "xl/workbook.xml");
    if (!wbXml) throw new Error("Missing xl/workbook.xml (legacy .xls not supported - save as .xlsx)");

    const shared = parseSharedStrings(await zipReadText(zip, "xl/sharedStrings.xml"));
    const dateStyles = parseDateStyles(await zipReadText(zip, "xl/styles.xml"));

    const wb = parseXml(wbXml);
    const sheetTags = Array.from(wb.getElementsByTagName("sheet"));

    // rId -> real path via the rels (do not assume sheetN.xml ordering).
    const relXml = await zipReadText(zip, "xl/_rels/workbook.xml.rels");
    const relMap = {};
    if (relXml) {
      Array.from(parseXml(relXml).getElementsByTagName("Relationship")).forEach(function (r) {
        relMap[r.getAttribute("Id")] = r.getAttribute("Target");
      });
    }

    const sheets = [];
    for (let i = 0; i < sheetTags.length; i++) {
      const st = sheetTags[i];
      const name = st.getAttribute("name") || ("Sheet" + (i + 1));
      const rid = st.getAttribute("r:id");
      let target = rid && relMap[rid] ? relMap[rid] : null;
      if (target && target.charAt(0) === "/") target = target.slice(1);
      const path = target
        ? (target.indexOf("xl/") === 0 ? target : "xl/" + target)
        : "xl/worksheets/sheet" + (i + 1) + ".xml";
      let xml = await zipReadText(zip, path);
      if (!xml) xml = await zipReadText(zip, "xl/worksheets/sheet" + (i + 1) + ".xml");
      if (!xml) continue;
      sheets.push({ name: name, rows: sheetToRows(xml, shared, dateStyles) });
    }
    if (!sheets.length) throw new Error("No worksheets found in this workbook");
    return { sheets: sheets };
  }

  /* ============================ ZIP writing ============================ */

  let CRC_TABLE = null;
  function crcTable() {
    if (CRC_TABLE) return CRC_TABLE;
    const tab = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      tab[i] = c >>> 0;
    }
    CRC_TABLE = tab;
    return tab;
  }

  function crc32(bytes) {
    const tab = crcTable();
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = tab[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  async function deflateRaw(bytes) {
    const cs = new CompressionStream("deflate-raw");
    const w = cs.writable.getWriter();
    w.write(bytes);
    w.close();
    return new Uint8Array(await new Response(cs.readable).arrayBuffer());
  }

  // Pack {name, text} files into a ZIP Blob (deflate, falls back to store).
  async function zipCreateText(files) {
    const enc = new TextEncoder();
    const parts = [];
    const central = [];
    let offset = 0;

    for (const f of files) {
      const nameBytes = enc.encode(f.name);
      const raw = enc.encode(f.text);
      const crc = crc32(raw);
      let body = await deflateRaw(raw);
      let method = 8;
      if (body.length >= raw.length) { body = raw; method = 0; } // tiny text can grow

      const lh = new Uint8Array(30 + nameBytes.length);
      const ldv = new DataView(lh.buffer);
      ldv.setUint32(0, 0x04034b50, true);
      ldv.setUint16(4, 20, true);
      ldv.setUint16(6, 0, true);
      ldv.setUint16(8, method, true);
      ldv.setUint16(10, 0, true);
      ldv.setUint16(12, 0x21, true);                          // 1980-01-01
      ldv.setUint32(14, crc, true);
      ldv.setUint32(18, body.length, true);
      ldv.setUint32(22, raw.length, true);
      ldv.setUint16(26, nameBytes.length, true);
      ldv.setUint16(28, 0, true);
      lh.set(nameBytes, 30);
      parts.push(lh, body);

      const ch = new Uint8Array(46 + nameBytes.length);
      const cdv = new DataView(ch.buffer);
      cdv.setUint32(0, 0x02014b50, true);
      cdv.setUint16(4, 20, true);
      cdv.setUint16(6, 20, true);
      cdv.setUint16(8, 0, true);
      cdv.setUint16(10, method, true);
      cdv.setUint16(12, 0, true);
      cdv.setUint16(14, 0x21, true);
      cdv.setUint32(16, crc, true);
      cdv.setUint32(20, body.length, true);
      cdv.setUint32(24, raw.length, true);
      cdv.setUint16(28, nameBytes.length, true);
      cdv.setUint16(30, 0, true);
      cdv.setUint16(32, 0, true);
      cdv.setUint16(34, 0, true);
      cdv.setUint32(38, 0, true);
      cdv.setUint32(42, offset, true);
      ch.set(nameBytes, 46);
      central.push(ch);

      offset += lh.length + body.length;
    }

    let cdSize = 0;
    central.forEach(function (c) { cdSize += c.length; });

    const eocd = new Uint8Array(22);
    const edv = new DataView(eocd.buffer);
    edv.setUint32(0, 0x06054b50, true);
    edv.setUint16(8, files.length, true);
    edv.setUint16(10, files.length, true);
    edv.setUint32(12, cdSize, true);
    edv.setUint32(16, offset, true);

    return new Blob(parts.concat(central, [eocd]), { type: "application/zip" });
  }

  /* ============================ XLSX writing ============================ */

  // 0-based index -> column letters: 0->A, 25->Z, 26->AA
  function indexToCol(n) {
    let s = "";
    n = n + 1;
    while (n > 0) {
      const r = (n - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  function xmlEscape(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;")
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");     // illegal in XML 1.0
  }

  // Leading-zero and long digit strings (phone numbers, IDs) must stay text,
  // otherwise Excel eats the zeros or switches to scientific notation.
  function isPlainNumber(s) {
    if (typeof s !== "string" || s === "") return false;
    if (!/^-?(0|[1-9]\d*)(\.\d+)?$/.test(s)) return false;
    if (s.replace(/[-.]/g, "").length > 15) return false;
    return isFinite(Number(s));
  }

  // One worksheet. rows[0] gets the bold header style (s="1").
  function sheetXml(rows) {
    const width = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
    const parts = [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
      "<sheetData>"
    ];

    rows.forEach(function (r, i) {
      const rn = i + 1;
      parts.push('<row r="' + rn + '">');
      for (let j = 0; j < width; j++) {
        const v = r[j];
        if (v === null || v === undefined || v === "") continue;
        const ref = indexToCol(j) + rn;
        const s = String(v);
        if (i > 0 && isPlainNumber(s)) {
          parts.push('<c r="' + ref + '"><v>' + s + "</v></c>");
        } else {
          // Headers (and all non-numeric text) stay inline strings.
          parts.push('<c r="' + ref + '" t="inlineStr"' + (i === 0 ? ' s="1"' : "")
            + '><is><t xml:space="preserve">' + xmlEscape(s) + "</t></is></c>");
        }
      }
      parts.push("</row>");
    });
    parts.push("</sheetData></worksheet>");
    return parts.join("");
  }

  function safeSheetName(name, i) {
    const n = String(name || ("Sheet" + (i + 1))).replace(/[\[\]*\/\\?:]/g, "_").slice(0, 31);
    return n || ("Sheet" + (i + 1));
  }

  // Build a multi-sheet xlsx Blob.
  // Accepts [{name, rows}] or a single {name, rows}.
  async function buildXLSX(sheets) {
    const list = (Array.isArray(sheets) ? sheets : [sheets]).map(function (s, i) {
      return { name: safeSheetName(s.name, i), rows: s.rows || [] };
    });
    if (!list.length) list.push({ name: "Sheet1", rows: [] });

    const NS = "http://schemas.openxmlformats.org/";
    let ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="' + NS + 'officedocument.spreadsheetml.sheet.main+xml"/>';
    list.forEach(function (_, i) {
      ct += '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="'
        + NS + 'officedocument.spreadsheetml.worksheet+xml"/>';
    });
    ct += '<Override PartName="/xl/styles.xml" ContentType="'
      + NS + 'officedocument.spreadsheetml.styles+xml"/></Types>';

    const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="' + NS + 'officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      + "</Relationships>";

    let sheetTags = "";
    list.forEach(function (s, i) {
      sheetTags += '<sheet name="' + xmlEscape(s.name) + '" sheetId="' + (i + 1)
        + '" r:id="rId' + (i + 1) + '"/>';
    });
    const wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<workbook xmlns="' + NS + 'spreadsheetml/2006/main"'
      + ' xmlns:r="' + NS + 'officeDocument/2006/relationships">'
      + "<sheets>" + sheetTags + "</sheets></workbook>";

    let relTags = "";
    list.forEach(function (s, i) {
      relTags += '<Relationship Id="rId' + (i + 1) + '" Type="'
        + NS + 'officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
    });
    relTags += '<Relationship Id="rId' + (list.length + 1) + '" Type="'
      + NS + 'officeDocument/2006/relationships/styles" Target="styles.xml"/>';
    const wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + relTags + "</Relationships>";

    // Style 0 = normal, style 1 = bold header.
    const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<styleSheet xmlns="' + NS + 'spreadsheetml/2006/main">'
      + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>'
      + '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
      + '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>'
      + '<borders count="1"><border/></borders>'
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
      + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'
      + "</styleSheet>";

    const files = [
      { name: "[Content_Types].xml", text: ct },
      { name: "_rels/.rels", text: rootRels },
      { name: "xl/workbook.xml", text: wb },
      { name: "xl/_rels/workbook.xml.rels", text: wbRels },
      { name: "xl/styles.xml", text: styles }
    ];
    list.forEach(function (s, i) {
      files.push({ name: "xl/worksheets/sheet" + (i + 1) + ".xml", text: sheetXml(s.rows) });
    });
    return zipCreateText(files);
  }

  return {
    parseXLSX: parseXLSX,
    buildXLSX: buildXLSX,
    zipCreateText: zipCreateText,
    zipReadText: zipReadText,
    zipEntries: zipEntries,
    crc32: crc32,
    colToIndex: colToIndex,
    indexToCol: indexToCol,
    excelSerialToDate: excelSerialToDate
  };
})();

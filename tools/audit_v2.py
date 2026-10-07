"""DataForge v2 audit — XLSX merge pipeline + pro image workbench.

Features merged in from FileMergerPro / imageforgepro:
  1. DFPXlsx multi-sheet build -> parse round-trip.
  2. Real .xlsx uploads merged in the workbench; source column + xlsx export.
  3. Engine image transforms: percent resize, rotate, crop, circle.
  4. UI batch run -> dataforge-images.zip (dims, suffix, circle PNG).

Usage:  py tools/audit_v2.py
"""
import http.server, socketserver, threading, functools, os, sys, tempfile, struct, zipfile, re

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
findings = []


def check(cond, msg):
    print(("  OK   " if cond else "  FAIL ") + msg)
    if not cond:
        findings.append(msg)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


httpd = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=ROOT))
PORT = httpd.server_address[1]
threading.Thread(target=httpd.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{PORT}"
print(f"[server] {BASE}\n")

tmp = tempfile.mkdtemp()


# ---------- minimal real .xlsx writer (inline strings, multi-sheet) ----------
def esc(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;"))


def xlsx_write(path, sheets):
    """sheets = [(name, [[header...], [row...], ...])]"""
    def col(n):
        s = ""
        n += 1
        while n:
            n, r = divmod(n - 1, 26)
            s = chr(65 + r) + s
        return s

    def sheet_xml(rows):
        out = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
               '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>']
        for ri, row in enumerate(rows, 1):
            out.append(f'<row r="{ri}">')
            for ci, v in enumerate(row):
                if v == "" or v is None:
                    continue
                ref = f"{col(ci)}{ri}"
                if ri > 1 and re.fullmatch(r"-?\d+", str(v)):
                    out.append(f'<c r="{ref}"><v>{v}</v></c>')
                else:
                    bold = ' s="1"' if ri == 1 else ""
                    out.append(f'<c r="{ref}" t="inlineStr"{bold}><is><t xml:space="preserve">{esc(v)}</t></is></c>')
            out.append("</row>")
        out.append("</sheetData></worksheet>")
        return "".join(out)

    NS = "http://schemas.openxmlformats.org/"
    ct = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
          '<Default Extension="xml" ContentType="application/xml"/>'
          '<Override PartName="/xl/workbook.xml" ContentType="' + NS + 'officedocument.spreadsheetml.sheet.main+xml"/>')
    for i in range(len(sheets)):
        ct += ('<Override PartName="/xl/worksheets/sheet%d.xml" ContentType="' % (i + 1)
               + NS + 'officedocument.spreadsheetml.worksheet+xml"/>')
    ct += ('<Override PartName="/xl/styles.xml" ContentType="'
           + NS + 'officedocument.spreadsheetml.styles+xml"/></Types>')
    root_rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                 '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                 '<Relationship Id="rId1" Type="' + NS + 'officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
    tags = "".join(f'<sheet name="{esc(n)}" sheetId="{i+1}" r:id="rId{i+1}"/>' for i, (n, _) in enumerate(sheets))
    wb = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          '<workbook xmlns="' + NS + 'spreadsheetml/2006/main" xmlns:r="' + NS + 'officeDocument/2006/relationships">'
          f"<sheets>{tags}</sheets></workbook>")
    rels = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">']
    for i in range(len(sheets)):
        rels.append('<Relationship Id="rId%d" Type="' % (i + 1) + NS + 'officeDocument/2006/relationships/worksheet" '
                    'Target="worksheets/sheet%d.xml"/>' % (i + 1))
    rels.append('<Relationship Id="rId%d" Type="' % (len(sheets) + 1) + NS + 'officeDocument/2006/relationships/styles" Target="styles.xml"/>')
    rels.append("</Relationships>")
    styles = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
              '<styleSheet xmlns="' + NS + 'spreadsheetml/2006/main">'
              '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>'
              '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
              '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>'
              '<borders count="1"><border/></borders>'
              '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
              '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
              '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>')
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", ct)
        z.writestr("_rels/.rels", root_rels)
        z.writestr("xl/workbook.xml", wb)
        z.writestr("xl/_rels/workbook.xml.rels", "".join(rels))
        z.writestr("xl/styles.xml", styles)
        for i, (_, rows) in enumerate(sheets):
            z.writestr(f"xl/worksheets/sheet{i+1}.xml", sheet_xml(rows))


def png_dims(data):
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    return struct.unpack(">II", data[16:24])


def png(path, w=40, h=20):
    def chunk(t, d):
        c = t + d
        return struct.pack(">I", len(d)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
    raw = b"".join(b"\x00" + b"".join(bytes([(x * 6) % 256, 80, 160]) for x in range(w)) for _ in range(h))
    open(path, "wb").write(b"\x89PNG\r\n\x1a\n"
                           + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
                           + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


import zlib
p1 = os.path.join(tmp, "one.png"); png(p1, 80, 40)
p2 = os.path.join(tmp, "two.png"); png(p2, 60, 60)

a = os.path.join(tmp, "q1.xlsx")
b = os.path.join(tmp, "q2.xlsx")
xlsx_write(a, [("Sales", [["id", "name", "city"], ["1", "Alice", "NYC"], ["2", "Bob", "LA"]]),
               ("Extra", [["id", "note"], ["9", "second-sheet"]])])
xlsx_write(b, [("Main", [["id", "name", "city"], ["2", "Bob", "LA"], ["3", "Carol", "SF"]])])

from playwright.sync_api import sync_playwright

with sync_playwright() as pw:
    br = pw.chromium.launch()
    page = br.new_page(accept_downloads=True)
    errs = []
    page.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    page.on("console", lambda m: errs.append("console: " + m.text) if m.type == "error" else None)

    print("=== 1. DFPXlsx in-page multi-sheet round-trip ===")
    page.goto(f"{BASE}/tool.html?id=dedup-merge")
    page.wait_for_selector("#inputArea")
    rt = page.evaluate("""async () => {
      const blob = await DFPXlsx.buildXLSX([
        { name: "First", rows: [["a", "b"], ["1", "x"]] },
        { name: "2nd", rows: [["z"], ["007"]] }
      ]);
      const book = await DFPXlsx.parseXLSX(await blob.arrayBuffer());
      return { names: book.sheets.map(s => s.name), first: book.sheets[0].rows,
               zero: book.sheets[1].rows[1][0] };
    }""")
    check(rt["names"] == ["First", "2nd"], f"sheet names preserved: {rt['names']}")
    check(rt["first"] == [["a", "b"], ["1", "x"]], f"cell values preserved: {rt['first']}")
    check(rt["zero"] == "007", f"leading-zero string kept as text: {rt['zero']!r}")

    print("\n=== 2. merge 2 xlsx uploads (3 sheets), source col, xlsx export ===")
    page.set_input_files("#fileInput", [a, b])
    page.wait_for_timeout(900)
    check(page.eval_on_selector_all(".img-thumb", "e=>e.length") == 0, "no image thumbs on merge tool")
    page.check('[data-key="sourceCol"]')
    stat = page.text_content("#inputStat")
    check("3" in stat and "2" in stat, f"input stat shows 2 files / 3 sheets: {stat!r}")
    page.click("#runBtn")   # default CSV mode -> fills preview, no download
    page.wait_for_timeout(400)
    page.select_option('[data-key="mergeFormat"]', "xlsx")
    page.click("#runBtn")
    page.wait_for_timeout(900)
    out_csv = page.input_value("#outputArea")
    check(out_csv.splitlines()[0].startswith("Source,"), f"preview has Source header: {out_csv.splitlines()[0]!r}")
    check("second-sheet" in out_csv, "rows from second worksheet included")
    check("q1.xlsx / Sales" in out_csv, "source label carries file+sheet")
    with page.expect_download() as dl2:
        page.click("#downloadBtn")
    xpath = os.path.join(tmp, "merged.xlsx")
    dl2.value.save_as(xpath)
    with zipfile.ZipFile(xpath) as z:
        names = z.namelist()
        sheet = z.read("xl/worksheets/sheet1.xml").decode("utf-8")
        wbxml = z.read("xl/workbook.xml").decode("utf-8")
    check("xl/workbook.xml" in names and "[Content_Types].xml" in names, "download is a valid xlsx zip")
    check("Merged" in wbxml, "workbook contains Merged sheet")
    for needle in ("Source", "Alice", "Carol", "second-sheet"):
        check(needle in sheet, f"sheet1.xml contains {needle!r}")

    print("\n=== 3. engine image transforms (offscreen canvas) ===")
    eng = page.evaluate("""async () => {
      function mk(w, h, color) {
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').fillStyle = color; c.getContext('2d').fillRect(0, 0, w, h);
        return c;
      }
      const dims = async b => { const bm = await createImageBitmap(b); return [bm.width, bm.height]; };
      const src = mk(80, 40, '#36a');
      const base = await DFPEngine.processImage(src, { format: 'png' }, {});
      const pct = await DFPEngine.processImage(src, { format: 'png', resizeMode: 'percent', scale: 50 }, {});
      const rot = await DFPEngine.processImage(src, { format: 'png', rotation: '90' }, {});
      const crop = await DFPEngine.processImage(src, { format: 'png', crop: { x:0, y:0, w:.5, h:1, circle:false } }, {});
      const circle = await DFPEngine.processImage(src, { crop: { x:0, y:0, w:1, h:1, circle:true } }, {});
      return { base: await dims(base), pct: await dims(pct), rot: await dims(rot),
               crop: await dims(crop), circle: await dims(circle), circleType: circle.type };
    }""")
    check(eng["base"] == [80, 40], f"no-op keeps size: {eng['base']}")
    check(eng["pct"] == [40, 20], f"percent 50 halves dims: {eng['pct']}")
    check(eng["rot"] == [40, 80], f"rotate 90 swaps dims: {eng['rot']}")
    check(eng["crop"] == [40, 40], f"normalized crop half-width: {eng['crop']}")
    check(eng["circle"] == [40, 40] and eng["circleType"] == "image/png",
          f"circle crop is square PNG: {eng['circle']} {eng['circleType']}")

    print("\n=== 4. UI batch: percent + suffix -> ZIP ===")
    page.goto(f"{BASE}/tool.html?id=image-batch")
    page.wait_for_selector("#inputArea")
    page.set_input_files("#fileInput", [p1, p2])
    page.wait_for_timeout(700)
    check(page.is_visible(".crop-panel"), "crop editor appears after upload")
    check(page.evaluate("window.__dfpTest && typeof window.__dfpTest.setCrop === 'function'"),
          "crop test hook mounted")
    page.select_option('[data-key="resizeMode"]', "percent")
    page.fill('[data-key="imageScale"]', "50")
    page.fill('[data-key="imageNameSuffix"]', "_edited")
    with page.expect_download() as z1:
        page.click("#runBtn")
    zpath = os.path.join(tmp, "out.zip")
    z1.value.save_as(zpath)
    check(z1.value.suggested_filename == "dataforge-images.zip", "multi-file run downloads one zip")
    with zipfile.ZipFile(zpath) as z:
        zn = z.namelist()
        d1 = png_dims(z.read(zn[0])); d2 = png_dims(z.read(zn[1]))
    check(len(zn) == 2 and all(n.endswith(".png") and "_edited" in n for n in zn),
          f"zip has 2 renamed PNGs: {zn}")
    check(sorted([d1, d2]) == sorted([(40, 20), (30, 30)]), f"both images halved: {d1}, {d2}")

    print("\n=== 5. UI single image: circle crop at 50% -> square PNG ===")
    page.goto(f"{BASE}/tool.html?id=image-batch")
    page.wait_for_selector("#inputArea")
    page.set_input_files("#fileInput", [p2])
    page.wait_for_timeout(700)
    page.select_option('[data-key="resizeMode"]', "percent")
    page.fill('[data-key="imageScale"]', "50")
    page.evaluate("window.__dfpTest.setCrop({ x:0, y:0, w:1, h:1, circle:true })")
    with page.expect_download() as z2:
        page.click("#runBtn")
    cpath = os.path.join(tmp, "circle.png")
    z2.value.save_as(cpath)
    check(z2.value.suggested_filename.endswith(".png"), "circle forces .png download name")
    check(png_dims(open(cpath, "rb").read()) == (30, 30), "circle output is 30x30 square")

    print(f"\n=== console/page errors: {errs} ===")
    check(not errs, "no console errors")
    br.close()
httpd.shutdown()

print("\n=== FINDINGS ===")
if not findings:
    print("  none — v2 features verified")
    sys.exit(0)
for f in findings:
    print("  -", f)
sys.exit(1)



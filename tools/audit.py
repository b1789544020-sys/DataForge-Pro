"""DataForge — functional audit (headless).
Runs every tool in tool.html through a real browser and reports gaps.
Usage:  py tools/audit.py
"""
import http.server, socketserver, threading, functools, json, os, sys, time

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


Handler = functools.partial(Quiet, directory=ROOT)
httpd = socketserver.TCPServer(("127.0.0.1", 0), Handler)
PORT = httpd.server_address[1]
threading.Thread(target=httpd.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{PORT}"
print(f"[server] {BASE}\n")

from playwright.sync_api import sync_playwright

CASES = [
    # id, input text, option overrides {data-key: value}
    ("csv-cleaner", None, {}),
    ("column-extractor", None, {}),
    ("csv-to-json", None, {}),
    ("csv-to-json", None, {"jsonFrom": "json"}),   # reverse direction with CSV input -> should error gracefully
    ("csv-to-sql", None, {}),
    ("csv-to-markdown", None, {}),
    ("json-formatter", None, {"sortKeys": True}),
    ("base64-tool", None, {"base64Mode": "encode"}),
    ("text-batch", None, {"find": "apple", "replace": "APPLE"}),
    ("case-converter", None, {"target": "snake"}),
    ("regex-tester", "a@b.com and c@d.org", {}),
    ("dedup-merge", None, {}),
    ("image-batch", None, {}),
]

report = []


def set_opt(page, key, value):
    el = page.query_selector(f'[data-key="{key}"]')
    if not el:
        return False
    tag = el.evaluate("e => e.tagName.toLowerCase()")
    typ = el.evaluate("e => e.type || ''")
    if typ == "checkbox":
        el.set_checked(bool(value))
    elif tag == "select":
        el.select_option(str(value))
    else:
        el.fill(str(value))
    return True


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    errors = []
    page.on("console", lambda m: errors.append(f"{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

    # ---------- homepage ----------
    page.goto(f"{BASE}/index.html")
    page.wait_for_selector(".tool-card")
    cards = page.eval_on_selector_all(".tool-card", "els => els.length")
    cats = page.eval_on_selector_all(".cat-section", "els => els.length")
    tools_total = page.evaluate("window.DFP.TOOLS.length")
    pro_flags = page.evaluate("window.DFP.TOOLS.filter(t=>t.pro).length")
    print("=== HOMEPAGE ===")
    print(f"  tool cards rendered : {cards}")
    print(f"  registry tools      : {tools_total}")
    print(f"  tools flagged pro   : {pro_flags} (no gate exists in dashboard/workbench)")
    print(f"  category sections   : {cats}")
    page.fill("#toolSearch", "zzzz")
    print(f"  empty search state  : {page.text_content('.no-results')!r}")
    page.fill("#toolSearch", "")

    # ---------- each tool ----------
    print("\n=== TOOLS ===")
    for tid, text, opts in CASES:
        errors.clear()
        page.goto(f"{BASE}/tool.html?id={tid}")
        page.wait_for_selector("#inputArea")
        title = page.text_content("#toolName")
        page.click("#loadSample")
        if text is not None:
            page.fill("#inputArea", text)
        sample_len = len(page.input_value("#inputArea"))
        for k, v in opts.items():
            if not set_opt(page, k, v):
                report.append(f"{tid}: option '{k}' has no UI control")
        page.click("#runBtn")
        page.wait_for_timeout(400)
        out = page.input_value("#outputArea")
        thumbs = page.eval_on_selector_all(".img-thumb", "e => e.length")
        flag = "OK " if out.strip() or thumbs else "!! "
        print(f"  [{flag}] {tid:18s} sample={sample_len:4d} out={len(out):5d} thumbs={thumbs} "
              f"opts={list(opts) or '-'} title={title!r}")
        if out.strip():
            print(f"           first line: {out.splitlines()[0][:90]!r}")
        if errors:
            print(f"           console: {errors[:2]}")
        if not out.strip() and not thumbs:
            report.append(f"{tid}: produced no output after Load Sample + Run")

    # ---------- column list refresh on typing ----------
    errors.clear()
    page.goto(f"{BASE}/tool.html?id=column-extractor")
    page.wait_for_selector("#inputArea")
    page.fill("#inputArea", "a,b,c\n1,2,3")
    page.wait_for_timeout(200)
    cols = page.eval_on_selector_all(".col-item", "e => e.length")
    print(f"\n=== COLUMN LIST after typing (no Load Sample) === items={cols}")
    if cols == 0:
        report.append("column-extractor: column checkboxes do not refresh when data is pasted/typed")

    # ---------- i18n coverage ----------
    page.goto(f"{BASE}/tool.html?id=csv-cleaner")
    missing = page.evaluate("""() => {
      const keys = [];
      window.DFP.TOOLS.forEach(t => {
        keys.push('tool.'+t.id+'.name', 'tool.'+t.id+'.desc');
        (t.options||[]).forEach(o => {
          keys.push('opt.'+o.key);
          (o.opts||[]).forEach(v => keys.push('opt.'+o.key+'.'+v));
        });
      });
      const miss = {en:[], zh:[]};
      ['en','zh'].forEach(l => {
        window.DFP.setLang(l);
        keys.forEach(k => { if (window.DFP.t(k) === k) miss[l].push(k); });
      });
      return miss;
    }""")
    print("\n=== I18N MISSING KEYS ===")
    for lang, keys in missing.items():
        print(f"  {lang}: {len(keys)} -> {keys[:12]}")
        for k in keys:
            report.append(f"i18n[{lang}]: missing key {k}")

    browser.close()

print("\n=== FINDINGS ===")
if not report:
    print("  none")
for r in report:
    print("  -", r)
httpd.shutdown()

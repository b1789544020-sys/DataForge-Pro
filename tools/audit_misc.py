"""DataForge — remaining gap checks."""
import http.server, socketserver, threading, functools, os, sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


httpd = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=ROOT))
BASE = f"http://127.0.0.1:{httpd.server_address[1]}"
threading.Thread(target=httpd.serve_forever, daemon=True).start()

from playwright.sync_api import sync_playwright

with sync_playwright() as pw:
    br = pw.chromium.launch()
    page = br.new_page()
    page.goto(f"{BASE}/index.html")
    page.wait_for_selector(".tool-card")
    print("footer text (en):", repr(page.text_content(".footer")))
    print("tagline (en)    :", repr(page.text_content(".tagline")))
    page.click("#langToggle")
    page.wait_for_timeout(200)
    print("footer text (zh):", repr(page.text_content(".footer")))
    print("lang persisted  :", page.evaluate("localStorage.getItem('dfp_lang')"))

    print("\n--- image tool layout ---")
    page.goto(f"{BASE}/tool.html?id=image-batch")
    page.wait_for_selector("#inputArea")
    print("inputArea visible:", page.is_visible("#inputArea"))
    print("loadSample click on image tool ->", end=" ")
    page.click("#loadSample")
    page.wait_for_timeout(200)
    print("input:", repr(page.input_value("#inputArea")), "toast:", repr(page.text_content("#toast")))
    print("run with no images ->", end=" ")
    page.click("#runBtn"); page.wait_for_timeout(200)
    print("toast:", repr(page.text_content("#toast")))

    print("\n--- regex/dedup sample buttons ---")
    for tid in ("regex-tester", "dedup-merge"):
        page.goto(f"{BASE}/tool.html?id={tid}")
        page.wait_for_selector("#inputArea")
        page.click("#loadSample"); page.wait_for_timeout(150)
        print(f"  {tid}: sample -> {page.input_value('#inputArea')!r}")

    print("\n--- column-extractor rename/reorder UI? ---")
    page.goto(f"{BASE}/tool.html?id=column-extractor")
    page.wait_for_selector("#inputArea")
    page.click("#loadSample"); page.wait_for_timeout(200)
    print("  col items:", page.eval_on_selector_all(".col-item", "e=>e.length"))
    print("  rename inputs:", page.eval_on_selector_all(".col-item input[type=text]", "e=>e.length"))
    print("  engine supports renames:", page.evaluate("DFPEngine.extractColumns([['a','b'],['1','2']],{selected:[1,0],renames:{1:'B!'}})"))

    print("\n--- unknown tool id ---")
    page.goto(f"{BASE}/tool.html?id=nope")
    page.wait_for_timeout(300)
    print("  redirected to:", page.url.split('/')[-1])

    print("\n--- csv with quotes/newlines roundtrip ---")
    page.goto(f"{BASE}/tool.html?id=csv-to-json")
    page.wait_for_selector("#inputArea")
    page.fill("#inputArea", 'name,note\n"Smith, John","line1\nline2"\n')
    page.click("#runBtn"); page.wait_for_timeout(200)
    print("  ", page.input_value("#outputArea").replace("\n", " "))

    print("\n--- large input perf (50k rows) ---")
    page.goto(f"{BASE}/tool.html?id=csv-cleaner")
    page.wait_for_selector("#inputArea")
    ms = page.evaluate("""() => {
      let s = 'id,name\\n';
      for (let i=0;i<50000;i++) s += i%2 + ',n' + i + '\\n';
      document.getElementById('inputArea').value = s;
      const t0 = performance.now();
      document.getElementById('runBtn').click();
      return {ms: Math.round(performance.now()-t0), out: document.getElementById('outputArea').value.length};
    }""")
    print("  ", ms)

    br.close()
httpd.shutdown()

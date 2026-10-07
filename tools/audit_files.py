"""DataForge — file-based tool audit (dedup-merge, image-batch, single-file upload)."""
import http.server, socketserver, threading, functools, os, sys, tempfile, struct, zlib

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


httpd = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=ROOT))
PORT = httpd.server_address[1]
threading.Thread(target=httpd.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{PORT}"

tmp = tempfile.mkdtemp()
a = os.path.join(tmp, "a.csv")
b = os.path.join(tmp, "b.csv")
open(a, "w", encoding="utf-8").write("id,name\n1,Alice\n2,Bob\n")
open(b, "w", encoding="utf-8").write("id,name,city\n2,Bob,LA\n3,Carol,SF\n")
xlsx = os.path.join(tmp, "book.xlsx")
open(xlsx, "wb").write(b"PK\x03\x04fake-xlsx")


def png(path, w=40, h=20):
    def chunk(t, d):
        c = t + d
        return struct.pack(">I", len(d)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
    raw = b"".join(b"\x00" + b"".join(bytes([(x * 6) % 256, 80, 160]) for x in range(w)) for _ in range(h))
    data = (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw))
            + chunk(b"IEND", b""))
    open(path, "wb").write(data)


p1 = os.path.join(tmp, "one.png")
p2 = os.path.join(tmp, "two.png")
png(p1); png(p2)

from playwright.sync_api import sync_playwright

with sync_playwright() as pw:
    br = pw.chromium.launch()
    page = br.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))

    print("=== dedup-merge (2 CSV upload) ===")
    page.goto(f"{BASE}/tool.html?id=dedup-merge")
    page.wait_for_selector("#inputArea")
    page.set_input_files("#fileInput", [a, b])
    page.wait_for_timeout(500)
    page.click("#runBtn")
    page.wait_for_timeout(400)
    print("  union out:\n   " + page.input_value("#outputArea").replace("\n", "\n   "))
    page.select_option('[data-key="joinType"]', "inner")
    page.click("#runBtn"); page.wait_for_timeout(300)
    print("  inner out:\n   " + page.input_value("#outputArea").replace("\n", "\n   "))
    page.fill('[data-key="dedupKey"]', "id")
    page.select_option('[data-key="joinType"]', "union")
    page.click("#runBtn"); page.wait_for_timeout(300)
    print("  union+dedupKey=id:\n   " + page.input_value("#outputArea").replace("\n", "\n   "))
    print("  input textarea shows uploaded data?", repr(page.input_value("#inputArea"))[:40])
    print("  export button will download CSV of output (blob)")

    print("\n=== image-batch (2 PNG upload) ===")
    page.goto(f"{BASE}/tool.html?id=image-batch")
    page.wait_for_selector("#inputArea")
    page.set_input_files("#fileInput", [p1, p2])
    page.wait_for_timeout(500)
    print("  thumbs after upload:", page.eval_on_selector_all(".img-thumb", "e=>e.length"))
    page.select_option('[data-key="imageFormat"]', "webp")
    page.fill('[data-key="imageWidth"]', "20")
    page.fill('[data-key="imageWatermark"]', "DF")
    page.click("#runBtn"); page.wait_for_timeout(800)
    caps = page.eval_on_selector_all(".img-thumb figcaption", "e=>e.map(x=>x.textContent)")
    print("  thumbs after run:", caps)
    print("  outputArea:", repr(page.input_value("#outputArea"))[:60])

    print("\n=== single-file upload: unsupported type (xlsx) ===")
    page.goto(f"{BASE}/tool.html?id=csv-cleaner")
    page.wait_for_selector("#inputArea")
    page.set_input_files("#fileInput", [xlsx])
    page.wait_for_timeout(400)
    print("  toast:", repr(page.text_content("#toast")))
    print("  input after xlsx upload:", repr(page.input_value("#inputArea"))[:40])

    print("\n=== drag&drop zone visible? ===")
    print("  dropZone box:", page.eval_on_selector("#dropZone", "e=>({w:e.offsetWidth,h:e.offsetHeight,disp:getComputedStyle(e).display})"))

    print("\npageerrors:", errs)
    br.close()
httpd.shutdown()

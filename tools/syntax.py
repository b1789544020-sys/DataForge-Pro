"""Syntax-check every JS file in assets/js using the browser's own parser."""
import os, sys, json
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
from playwright.sync_api import sync_playwright

files = sorted(f for f in os.listdir(os.path.join(ROOT, "assets", "js")) if f.endswith(".js"))
with sync_playwright() as pw:
    b = pw.chromium.launch()
    p = b.new_page()
    p.goto("about:blank")
    for f in files:
        src = open(os.path.join(ROOT, "assets", "js", f), encoding="utf-8").read()
        res = p.evaluate(
            "src => { try { new Function(src); return 'OK'; } catch (e) { return e.message; } }",
            src,
        )
        print(("  OK    " if res == "OK" else "  ERR   ") + f + ("" if res == "OK" else "  -> " + res))
    b.close()

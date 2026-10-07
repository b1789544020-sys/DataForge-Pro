"""Print the exact line/column of a JS syntax error using CDP Runtime.compileScript."""
import os, sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rel = sys.argv[1]
src = open(os.path.join(ROOT, rel), encoding="utf-8").read()
lines = src.split("\n")
from playwright.sync_api import sync_playwright

with sync_playwright() as pw:
    b = pw.chromium.launch()
    p = b.new_page()
    p.goto("about:blank")
    cdp = p.context.new_cdp_session(p)
    cdp.send("Runtime.enable")
    res = cdp.send("Runtime.compileScript",
                   {"expression": src, "sourceURL": rel, "persistScript": False})
    det = res.get("exceptionDetails")
    if not det:
        print("OK — no syntax error")
    else:
        print(det.get("text"), "|", (det.get("exception") or {}).get("description"))
        ln = det.get("lineNumber", 0)
        col = det.get("columnNumber", 0)
        print(f"at line {ln + 1}, col {col + 1}")
        for i in range(max(0, ln - 5), min(len(lines), ln + 3)):
            print(f"{i+1:4d} | {lines[i]}")
    b.close()

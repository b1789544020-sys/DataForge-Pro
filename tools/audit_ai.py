"""DataForge — AI layer verification (headless).

Checks that the optional AI layer:
  * loads without JS errors on both pages,
  * makes ZERO network requests while disabled (the core privacy promise),
  * produces option patches offline and applies them to the real controls,
  * profiles data and surfaces quality issues,
  * recommends tools on the homepage,
  * and that the newly fixed defects (samples, column refresh, pasted merge,
    footer.copyright) actually work.

Usage:  py tools/audit_ai.py
"""
import http.server, socketserver, threading, functools, os, sys

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

fails = []


def check(name, ok, detail=""):
    print(("  PASS  " if ok else "  FAIL  ") + name + (f"  -- {detail}" if detail else ""))
    if not ok:
        fails.append(name)


with sync_playwright() as pw:
    browser = pw.chromium.launch()
    ctx = browser.new_context()

    errors, external = [], []
    ctx.on("weberror", lambda e: errors.append(str(e.error)))

    def watch(req):
        # blob:/data: are in-page URLs created by the tools themselves (downloads,
        # canvas output) and never leave the machine.
        if req.url.startswith((BASE, "data:", "blob:", "about:")):
            return
        external.append(req.url)

    ctx.on("request", watch)
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

    # ---------------------------------------------------------------- homepage
    print("[1] index.html - AI finder, offline")
    page.goto(f"{BASE}/index.html")
    page.wait_for_timeout(300)
    check("no JS errors on homepage", not errors, "; ".join(errors[:3]))
    check("AI settings button injected", page.locator("#aiSettingsBtn").count() == 1)
    check("AI badge shows 'off' by default",
          "off" in page.inner_text("#aiSettingsBtn").lower(),
          page.inner_text("#aiSettingsBtn"))
    check("AI disabled by default", page.evaluate("!DFPAI.getConfig().enabled"))
    check("footer.copyright resolved (no raw key)",
          "footer.copyright" not in page.inner_text(".footer"),
          page.inner_text(".footer").strip())

    page.fill("#aiTask", "merge three csv files and remove duplicate rows")
    page.click("#aiFindBtn")
    page.wait_for_selector("#aiFinderOut .ai-pick", timeout=5000)
    picks = page.eval_on_selector_all("#aiFinderOut .ai-pick",
                                      "els => els.map(e => e.getAttribute('href'))")
    check("offline recommendation returns picks", len(picks) > 0, str(picks))
    check("recommended dedup-merge", any("dedup-merge" in h for h in picks), str(picks))
    check("pick links carry the task", all("task=" in h for h in picks))

    page.click("#aiSettingsBtn")
    page.wait_for_selector("#aiModal .ai-modal", state="visible")
    page.click("[data-preset='ollama']")
    check("preset fills base url",
          page.input_value("#aiBaseUrl") == "http://localhost:11434/v1")
    page.click("#aiCancel")
    check("cancel does not persist config", page.evaluate("!DFPAI.getConfig().enabled"))

    # ------------------------------------------------------------- tool page
    print("\n[2] tool.html - copilot on csv-cleaner, offline")
    page.goto(f"{BASE}/tool.html?id=csv-cleaner")
    page.wait_for_selector("#aiBar #aiPrompt")
    check("copilot bar mounted", page.locator("#aiPlanBtn").count() == 1)
    check("mode shows offline rules",
          "offline" in page.inner_text("#aiMode").lower(), page.inner_text("#aiMode"))

    page.click("#loadSample")
    page.fill("#aiPrompt", "remove duplicates, drop empty rows, trim spaces and lowercase everything")
    page.click("#aiPlanBtn")
    page.wait_for_selector("#aiOut .ai-patch li", timeout=5000)
    suggested = page.inner_text("#aiOut .ai-patch")
    check("offline plan suggests options", len(suggested.strip()) > 0, suggested.replace("\n", " | "))

    page.click("#aiApplyRun")
    page.wait_for_timeout(400)
    check("dedup checkbox applied", page.is_checked("#optionsArea [data-key='dedup']"))
    check("trim checkbox applied", page.is_checked("#optionsArea [data-key='trim']"))
    check("caseMode set to lower",
          page.input_value("#optionsArea [data-key='caseMode']") == "lower",
          page.input_value("#optionsArea [data-key='caseMode']"))
    out = page.input_value("#outputArea")
    check("apply-and-run produced output", len(out) > 0)
    # the cleaner intentionally preserves the header row, so only the body is cased
    body_lines = out.split("\n")[1:]
    check("output body is lowercased",
          all(l == l.lower() for l in body_lines), out[:60].replace("\n", " | "))

    # ---------------------------------------------------------------- diagnose
    print("\n[3] tool.html - diagnose")
    page.fill("#inputArea", 'name, email ,city\nA, a@x.com ,NY\nA, a@x.com ,NY\n\nB, bad-email ,LA\n')
    page.click("#aiDiagBtn")
    page.wait_for_selector("#aiOut .ai-findings li, #aiOut .ai-ok", timeout=5000)
    diag = page.inner_text("#aiOut")
    check("diagnose reports duplicate rows", "duplicate" in diag.lower(), diag.replace("\n", " | ")[:160])
    check("diagnose reports whitespace", "whitespace" in diag.lower())
    check("diagnose reports bad email", "email" in diag.lower())
    check("diagnose offers a fix patch", page.locator("#aiApply").count() == 1)

    # ------------------------------------------------------ payload / explain
    print("\n[4] tool.html - payload transparency")
    page.click("#aiPayloadBtn")
    page.wait_for_selector("#aiOut .ai-text")
    payload = page.inner_text("#aiOut .ai-text")
    check("email masked in payload", "a@x.com" not in payload, payload.replace("\n", " | ")[:120])
    check("payload marked as not-sent",
          "not configured" in page.inner_text("#aiOut").lower())

    page.click("#aiExplainBtn")
    page.wait_for_timeout(200)
    check("explain asks for a model when offline",
          "endpoint" in page.inner_text("#aiOut").lower(), page.inner_text("#aiOut")[:120])

    # ------------------------------------------------------- fixed defects
    print("\n[5] regression - previously broken behaviour")
    page.goto(f"{BASE}/tool.html?id=column-extractor")
    page.wait_for_selector("#colList")
    page.fill("#inputArea", "alpha,beta,gamma\n1,2,3")
    page.wait_for_timeout(400)
    cols = page.eval_on_selector_all("#colList .col-item span", "e => e.map(x => x.textContent)")
    check("column list refreshes on typing", cols == ["alpha", "beta", "gamma"], str(cols))
    page.uncheck("#colList [data-col='1']")
    page.fill("#inputArea", "alpha,beta,gamma\n1,2,3\n4,5,6")
    page.wait_for_timeout(400)
    check("column selection preserved across edits",
          not page.is_checked("#colList [data-col='1']"))
    page.click("#runBtn")
    check("extractor honours unchecked column",
          page.input_value("#outputArea").startswith("alpha,gamma"),
          page.input_value("#outputArea")[:40])

    page.goto(f"{BASE}/tool.html?id=dedup-merge")
    page.wait_for_selector("#loadSample")
    page.click("#loadSample")
    page.wait_for_timeout(200)
    check("dedup-merge sample is not empty", len(page.input_value("#inputArea")) > 0)
    page.click("#runBtn")
    page.wait_for_timeout(300)
    merged = page.input_value("#outputArea")
    check("dedup-merge works from pasted text", "Carol" in merged and "Alice" in merged,
          merged.replace("\n", " | "))
    check("dedup-merge removed duplicate rows", merged.count("Bob") == 1, merged.replace("\n", " | "))

    page.goto(f"{BASE}/tool.html?id=image-batch")
    page.wait_for_selector("#loadSample")
    page.click("#loadSample")
    page.wait_for_selector("#imagePreview .img-thumb", timeout=5000)
    page.wait_for_timeout(400)
    check("image-batch sample loads images",
          page.locator("#imagePreview .img-thumb").count() == 3,
          str(page.locator("#imagePreview .img-thumb").count()))
    page.select_option("#optionsArea [data-key='imageFormat']", "webp")
    page.click("#runBtn")
    page.wait_for_timeout(1500)
    caps = page.eval_on_selector_all("#imagePreview figcaption", "e => e.map(x => x.textContent)")
    check("image-batch converts to webp", len(caps) == 3 and all(".webp" in c for c in caps), str(caps))

    # ------------------------------------------------------------- privacy
    print("\n[6] privacy - zero network egress while AI is off")
    check("no external requests at all", not external, str(external[:5]))
    check("no JS errors during the whole run", not errors, "; ".join(errors[:3]))

    browser.close()

print("\n" + ("ALL CHECKS PASSED" if not fails else f"{len(fails)} FAILED: " + ", ".join(fails)))
httpd.shutdown()
sys.exit(1 if fails else 0)

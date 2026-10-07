"""DataForge — AI UI flow verification against a mock endpoint.

Companion to audit_mock_ai.py, which covers the remote engine's data handling.
This one clicks through the actual interface: the mode badge, the settings
modal's "Test connection", the one-time consent prompt, and the plan diff ->
Apply -> Run path, asserting the deterministic engine (not the model) is what
transforms the data.

Usage:  py tools/audit_mock_ai_ui.py
"""
import json, threading, functools, os, sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from mock_ai_server import (MockAI, ThreadedHTTP, QuietStatic, ThreadedStatic,
                           STATE, CASES, reply)

from playwright.sync_api import sync_playwright

fails = []


def check(name, ok, detail=""):
    print(("  PASS  " if ok else "  FAIL  ") + name + (f"  -- {detail}" if detail else ""))
    if not ok:
        fails.append(name)


mock = ThreadedHTTP(("127.0.0.1", 0), MockAI)
MOCK_URL = f"http://127.0.0.1:{mock.server_address[1]}/v1"
threading.Thread(target=mock.serve_forever, daemon=True).start()

static = ThreadedStatic(("127.0.0.1", 0), functools.partial(QuietStatic, directory=ROOT))
BASE = f"http://127.0.0.1:{static.server_address[1]}"
threading.Thread(target=static.serve_forever, daemon=True).start()

print(f"[mock AI ] {MOCK_URL}\n[static  ] {BASE}\n")

# Duplicate rows + stray whitespace, so a dedup/trim plan has visible effect.
SAMPLE = "Name,Email\n Ann , ann@mail.com \nBob,bob@mail.com\n Ann , ann@mail.com \n"

with sync_playwright() as pw:
    browser = pw.chromium.launch()
    page = browser.new_context().new_page()

    errors = []
    page.on("pageerror", lambda e: errors.append("pageerror: " + e.message))
    page.on("console", lambda m: errors.append("console: " + m.text)
            if m.type == "error" and "Failed to load resource" not in m.text else None)

    # ------------------------------------------------- 1. default state is silent
    print("[1] default state - AI off, nothing configured")
    page.goto(f"{BASE}/tool.html?id=csv-cleaner")
    page.wait_for_selector("#aiBar", timeout=5000)
    check("AI bar is rendered even when disabled", page.is_visible("#aiBar"))
    check("AI reports itself as not configured",
          not page.evaluate("window.DFPAI.isConfigured()"))
    badge = page.inner_text("#aiMode").strip()
    check("badge shows the offline-rules mode by default",
          "offline" in badge.lower(), repr(badge))
    check("badge carries the 'off' state class",
          "off" in page.get_attribute("#aiMode", "class"),
          page.get_attribute("#aiMode", "class"))
    check("no consent recorded yet", not page.evaluate("window.DFPAI.hasConsent()"))

    # ------------------------------------------- 2. settings modal + test button
    print("\n[2] settings modal - preset, save, test connection")
    page.click("#aiCfgBtn")
    page.wait_for_selector("#aiModal", timeout=3000)
    check("settings modal opens", page.is_visible("#aiModal"))

    page.check("#aiEnabled")
    page.fill("#aiBaseUrl", MOCK_URL)
    page.fill("#aiModel", "mock-model")
    page.fill("#aiApiKey", "")

    STATE["case"] = reply("ok")
    page.click("#aiTest")
    page.wait_for_function("document.querySelector('#aiStatus').textContent.trim().length > 0",
                           timeout=8000)
    status = page.inner_text("#aiStatus").strip()
    check("test connection succeeds against the mock", "ok" in status.lower(), repr(status[:60]))

    STATE["case"] = CASES["http_401"]
    page.click("#aiTest")
    page.wait_for_function(
        "document.querySelector('#aiStatus').textContent.indexOf('401') >= 0", timeout=8000)
    check("test connection reports HTTP errors instead of failing silently",
          "401" in page.inner_text("#aiStatus"), page.inner_text("#aiStatus").strip()[:60])

    page.click("#aiSave")
    page.wait_for_selector("#aiModal", state="hidden", timeout=3000)
    check("settings persisted to localStorage",
          page.evaluate("window.DFPAI.getConfig().baseUrl") == MOCK_URL)
    check("local endpoint needs no API key to be considered configured",
          page.evaluate("window.DFPAI.isConfigured()"))
    badge = page.inner_text("#aiMode").strip()
    check("badge switches to model mode without a reload",
          "mock-model" in badge, repr(badge))
    check("badge switches to the 'on' state class",
          "on" in (page.get_attribute("#aiMode", "class") or "").split(),
          page.get_attribute("#aiMode", "class"))

    # ----------------------------------------------- 3. payload preview (no send)
    print("\n[3] payload preview - inspect before anything is sent")
    page.fill("#inputArea", SAMPLE)
    before = len(STATE["seen"])
    page.click("#aiPayloadBtn")
    page.wait_for_timeout(400)
    out = page.inner_text("#aiOut")
    check("preview shows the outbound sample", "ann" in out.lower() or "Name" in out, out[:60])
    check("preview sends no request at all", len(STATE["seen"]) == before,
          f"{len(STATE['seen']) - before} extra calls")

    # ---------------------------------------------------- 4. one-time consent gate
    print("\n[4] consent gate")
    page.evaluate("localStorage.removeItem('dfp_ai_consent')")
    STATE["case"] = CASES["ui_plan"]

    page.once("dialog", lambda d: d.dismiss())
    before = len(STATE["seen"])
    page.fill("#aiPrompt", "remove duplicates and trim spaces")
    page.click("#aiPlanBtn")
    page.wait_for_timeout(600)
    check("declining consent blocks the request", len(STATE["seen"]) == before,
          f"{len(STATE['seen']) - before} calls slipped through")
    check("declining consent is not remembered",
          not page.evaluate("window.DFPAI.hasConsent()"))

    page.once("dialog", lambda d: d.accept())
    page.click("#aiPlanBtn")
    page.wait_for_selector("#aiApply", timeout=8000)
    check("accepting consent lets the request through", len(STATE["seen"]) > before,
          f"{len(STATE['seen']) - before} calls")
    check("consent is remembered for next time", page.evaluate("window.DFPAI.hasConsent()"))

    # ------------------------------------------------------- 5. the diff and Apply
    print("\n[5] plan diff -> Apply -> Run")
    rows = page.eval_on_selector_all(
        ".ai-patch li", "els => els.map(e => ({ text: e.textContent, same: e.className }))")
    check("diff lists one row per sanitized option", len(rows) == 4, f"{len(rows)} rows")
    check("options already at the target value are marked unchanged",
          sum(1 for r in rows if "same" in r["same"]) == 2,
          str([r["same"] for r in rows]))
    check("options that really change are not marked unchanged",
          sum(1 for r in rows if "same" not in r["same"]) == 2,
          str([r["text"].strip() for r in rows]))
    check("model's explanation is shown",
          "duplicate" in page.inner_text("#aiOut").lower(), page.inner_text("#aiOut")[:70])
    check("Apply / Apply+Run / Dismiss are all offered",
          page.evaluate("!!document.getElementById('aiApply') && "
                        "!!document.getElementById('aiApplyRun') && "
                        "!!document.getElementById('aiDismiss')"))

    # The two options that were off must stay off until the user clicks Apply.
    check("controls are NOT modified before Apply is clicked",
          page.evaluate("!document.querySelector('[data-key=\"normalizeWhitespace\"]').checked && "
                        "document.querySelector('[data-key=\"caseMode\"]').value === 'none'"))

    page.click("#aiApply")
    page.wait_for_timeout(400)
    check("Apply ticks the normalizeWhitespace checkbox",
          page.evaluate("document.querySelector('[data-key=\"normalizeWhitespace\"]').checked"))
    check("Apply sets the caseMode select",
          page.evaluate("document.querySelector('[data-key=\"caseMode\"]').value") == "lower")
    check("the diff card is hidden after applying",
          page.evaluate("document.getElementById('aiOut').hidden"))
    check("a confirmation toast is shown",
          page.evaluate("!!document.querySelector('.toast, #toast')"))

    # The deterministic engine, not the model, produces the output.
    page.click("#runBtn")
    page.wait_for_timeout(600)
    result = page.input_value("#outputArea")
    lines = [l for l in result.split("\n") if l.strip()]
    check("offline engine removed the duplicate row", len(lines) == 3,
          f"{len(lines)} lines: {lines}")
    check("offline engine applied trim + lower-case from the patch",
          "ann,ann@mail.com" in result, repr(result[:60]))

    # --------------------------------------------- 6. remote failure stays usable
    print("\n[6] a failing endpoint must not break the UI")
    STATE["case"] = CASES["http_500"]
    page.fill("#aiPrompt", "remove duplicates")
    page.click("#aiPlanBtn")
    page.wait_for_selector("#aiApply", timeout=8000)
    check("an offline plan is offered instead",
          page.eval_on_selector_all(".ai-patch li", "els => els.length") > 0)
    check("the endpoint error is disclosed, not hidden",
          "500" in page.inner_text("#aiOut"), page.inner_text("#aiOut")[-90:])
    check("the failure is styled as a warning",
          page.evaluate("!!document.querySelector('#aiOut .ai-warn')"))

    print("\n[7] stability")
    check("no page errors or console errors in the whole run", not errors,
          "; ".join(errors[:3]))

    browser.close()

print("\n" + ("ALL CHECKS PASSED" if not fails else f"{len(fails)} FAILED: " + ", ".join(fails)))
mock.shutdown()
static.shutdown()
sys.exit(1 if fails else 0)

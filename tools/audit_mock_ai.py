"""DataForge — remote AI engine verification against a mock endpoint.

Why this exists
---------------
The offline rule engine is covered by tools/audit_ai.py. The *remote* path
(remotePlan / remoteDiagnose / remoteExplain / remoteRecommend) had only ever
been exercised through its "request failed -> fall back to local" branch.

This script starts a fake OpenAI-compatible endpoint on 127.0.0.1 and replays
13 hand-written responses through it -- well-formed, fenced, malformed, wrong
types, HTTP errors, empty bodies and a timeout -- to prove that:

  * parseJSONLoose survives markdown fences and surrounding prose,
  * sanitizePatch drops unknown keys and coerces / rejects bad values,
  * every failure degrades to the offline result with fallbackError set,
  * a bad response never throws into the page (zero console/page errors).

No model download and no third-party network access is required.

Usage:  py tools/audit_mock_ai.py
"""
import json, threading, functools, os, sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from mock_ai_server import (MockAI, ThreadedHTTP, QuietStatic, ThreadedStatic,
                           STATE, CASES)


# ----------------------------------------------------------------------- harness
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

print(f"[mock AI ] {MOCK_URL}/chat/completions")
print(f"[static  ] {BASE}\n")

CFG = {
    "enabled": True,
    "baseUrl": MOCK_URL,
    "apiKey": "sk-test-not-a-real-key",
    "model": "mock-model",
    "maxRows": 20,
    "maxChars": 2000,
    "mask": True,
    "temperature": 0.2,
}

SAMPLE = ("Name, Email ,Age\n John Doe ,JOHN@MAIL.COM,25\njane , jane@mail.com ,30\n"
          " John Doe ,JOHN@MAIL.COM,25\n\n ,,\nBob,not-an-email,40")

with sync_playwright() as pw:
    browser = pw.chromium.launch()
    ctx = browser.new_context()
    page = ctx.new_page()

    errors = []
    # Chromium logs every non-2xx response to the console by itself. We trigger
    # 401/500 on purpose, so those lines are expected noise, not app errors.
    IGNORE = ("Failed to load resource",)

    def note_console(m):
        if m.type == "error" and not any(s in m.text for s in IGNORE):
            errors.append("console: " + m.text)

    page.on("pageerror", lambda e: errors.append("pageerror: " + e.message))
    page.on("console", note_console)

    def call(fn, case, *args):
        """Select a scenario, then run window.DFPAssist.<fn> and return its result."""
        STATE["case"] = CASES[case]
        return page.evaluate(
            "a => window.DFPAssist[a.fn].apply(null, a.args)"
            ".then(r => JSON.parse(JSON.stringify(r)))"
            ".catch(e => ({ THREW: String(e && e.message || e) }))",
            {"fn": fn, "args": list(args)},
        )

    page.goto(f"{BASE}/tool.html?id=csv-cleaner")
    page.wait_for_selector("#aiBar", timeout=5000)
    page.evaluate("c => localStorage.setItem('dfp_ai_cfg', JSON.stringify(c))", CFG)
    page.evaluate("localStorage.setItem('dfp_ai_consent', '1')")
    page.reload()
    page.wait_for_selector("#aiBar", timeout=5000)
    check("mock endpoint accepted as configured",
          page.evaluate("window.DFPAI.isConfigured()"))
    # The mock runs on 127.0.0.1, so it must be classified as a local endpoint
    # (this is the check that drives the green "AI local" badge).
    check("127.0.0.1 endpoint recognised as local",
          page.evaluate("window.DFPAI.isLocalEndpoint(window.DFPAI.getConfig().baseUrl)"))
    check("a hosted endpoint is not classified as local",
          not page.evaluate("window.DFPAI.isLocalEndpoint('https://api.openai.com/v1')"))

    # -------------------------------------------------- 1. well-formed responses
    print("\n[1] remote plan - responses the engine must accept")

    r = call("plan", "valid", "csv-cleaner", "clean it up", SAMPLE)
    check("valid: served by remote engine", r.get("source") == "remote", str(r.get("source")))
    check("valid: patch applied verbatim",
          r.get("patch") == {"dedup": True, "trim": True, "caseMode": "lower"}, str(r.get("patch")))
    check("valid: explain passed through", bool(r.get("explain")), str(r.get("explain"))[:60])
    check("valid: warnings passed through", r.get("warnings") == ["Removal cannot be undone"],
          str(r.get("warnings")))

    r = call("plan", "fenced", "csv-cleaner", "tidy", SAMPLE)
    check("fenced: markdown fence + prose stripped", r.get("source") == "remote", str(r.get("source")))
    check("fenced: patch parsed",
          r.get("patch") == {"dropEmptyRows": True, "normalizeWhitespace": True}, str(r.get("patch")))

    r = call("plan", "single_quote_prose", "csv-cleaner", "strip tags", SAMPLE)
    check("prose: JSON recovered from surrounding chatter",
          r.get("patch") == {"stripHTML": True}, str(r.get("patch")))

    # ------------------------------------------------------ 2. sanitizePatch work
    print("\n[2] remote plan - sanitizePatch must clean hostile output")

    r = call("plan", "unknown_keys", "csv-cleaner", "clean", SAMPLE)
    check("unknown: good key survives", r.get("patch", {}).get("dedup") is True, str(r.get("patch")))
    check("unknown: rmRf dropped", "rmRf" not in r.get("patch", {}), str(list(r.get("patch", {}))))
    check("unknown: __proto__ dropped", "__proto__" not in r.get("patch", {}),
          str(list(r.get("patch", {}))))
    check("unknown: other tool's key (imageQuality) dropped",
          "imageQuality" not in r.get("patch", {}), str(list(r.get("patch", {}))))
    check("unknown: rejected keys reported", len(r.get("rejected") or []) == 3,
          str(r.get("rejected")))
    check("unknown: prototype not polluted",
          page.evaluate("({}).x === undefined && Object.prototype.x === undefined"))

    r = call("plan", "wrong_types", "csv-cleaner", "clean", SAMPLE)
    check("types: 'yes' coerced to boolean true", r.get("patch", {}).get("dedup") is True,
          str(r.get("patch", {}).get("dedup")))
    check("types: 1 coerced to boolean true", r.get("patch", {}).get("trim") is True,
          str(r.get("patch", {}).get("trim")))
    check("types: out-of-enum caseMode rejected", "caseMode" not in r.get("patch", {}),
          str(r.get("patch")))
    check("types: number coerced to text for fillEmpty",
          r.get("patch", {}).get("fillEmpty") == "42", str(r.get("patch", {}).get("fillEmpty")))

    r = call("plan", "options_not_object", "csv-cleaner", "clean", SAMPLE)
    check("options-as-array: no crash, empty patch", r.get("patch") == {}, str(r))

    r = call("plan", "no_options", "csv-cleaner", "clean", SAMPLE)
    check("no-options: empty patch, still remote", r.get("patch") == {}, str(r.get("patch")))

    # ------------------------------------------- 3. failures must degrade offline
    print("\n[3] remote plan - every failure falls back to the offline engine")

    FAILURES = [
        ("http_401", "401"),
        ("http_500", "500"),
        ("not_json_at_all", "JSON"),
        ("empty_content", "Empty"),
        ("no_choices", "Empty"),
    ]
    for case, needle in FAILURES:
        r = call("plan", case, "csv-cleaner", "remove duplicates", SAMPLE)
        check(f"{case}: never throws into the page", "THREW" not in r, str(r.get("THREW")))
        check(f"{case}: falls back to local", r.get("source") == "local", str(r.get("source")))
        check(f"{case}: offline rules still produced a patch",
              bool(r.get("patch")), str(r.get("patch")))
        check(f"{case}: fallbackError surfaced to the user",
              needle.lower() in str(r.get("fallbackError", "")).lower(),
              str(r.get("fallbackError"))[:70])

    # plan() does not expose the timeout knob, so the abort path is verified
    # directly on the transport with a deadline shorter than the mock's delay.
    STATE["case"] = CASES["timeout"]
    r = page.evaluate(
        "() => window.DFPAI.chat([{role:'user',content:'hi'}], { timeout: 800 })"
        ".then(t => ({ ok: t })).catch(e => ({ err: e.message }))")
    check("timeout: AbortController fires and reports a timeout",
          "timed out" in str(r.get("err", "")).lower(), str(r)[:70])

    # --------------------------------------------------- 4. other entry points
    print("\n[4] diagnose / explain / recommend")

    r = call("diagnose", "diagnose_ok", "csv-cleaner", SAMPLE)
    check("diagnose: served by remote", r.get("source") == "remote", str(r.get("source")))
    check("diagnose: model summary kept", bool(r.get("summary")), str(r.get("summary"))[:50])
    check("diagnose: 3 findings kept", len(r.get("findings") or []) == 3, str(r.get("findings")))
    check("diagnose: local profile still attached",
          (r.get("profile") or {}).get("rows", 0) > 0, str((r.get("profile") or {}).get("rows")))
    check("diagnose: recommended options sanitized",
          r.get("patch") == {"dedup": True, "trim": True, "validateEmail": "mark"},
          str(r.get("patch")))

    r = call("diagnose", "http_500", "csv-cleaner", SAMPLE)
    check("diagnose failure: falls back to local", r.get("source") == "local", str(r.get("source")))
    check("diagnose failure: local profile survives",
          (r.get("profile") or {}).get("rows", 0) > 0, str(r.get("fallbackError"))[:50])
    check("diagnose failure: local fix patch offered", bool(r.get("patch")), str(r.get("patch")))

    r = call("explain", "explain_ok", "csv-cleaner", {"dedup": True}, SAMPLE, SAMPLE)
    check("explain: text returned", str(r.get("text", "")).startswith("- Removed"),
          str(r.get("text"))[:50])

    r = call("explain", "http_401", "csv-cleaner", {"dedup": True}, SAMPLE, SAMPLE)
    check("explain failure: rejects instead of hanging", "THREW" in r, str(r)[:70])

    r = call("recommend", "recommend_ok", "merge several csv files")
    check("recommend: remote picks used", r.get("source") == "remote", str(r.get("source")))
    check("recommend: hallucinated tool id filtered out",
          [p["id"] for p in r.get("picks", [])] == ["dedup-merge", "csv-cleaner"],
          str([p["id"] for p in r.get("picks", [])]))

    r = call("recommend", "not_json_at_all", "merge several csv files")
    check("recommend failure: falls back to keyword rules",
          r.get("source") == "local" and len(r.get("picks") or []) > 0, str(r.get("picks")))

    # -------------------------------------------- 5. what actually went on the wire
    print("\n[5] outbound payload - masking and minimisation")

    bodies = STATE["seen"]
    check("requests actually reached the mock endpoint", len(bodies) > 0, f"{len(bodies)} calls")

    last = bodies[-1] if bodies else {}
    check("model name taken from config", last.get("model") == "mock-model", str(last.get("model")))
    check("temperature sent", last.get("temperature") is not None, str(last.get("temperature")))

    blob = json.dumps(bodies, ensure_ascii=False)
    check("real email never left the browser", "JOHN@MAIL.COM" not in blob.upper(),
          "found a raw address" if "JOHN@MAIL.COM" in blob.upper() else "masked")
    check("masked placeholder present instead", "user@example.com" in blob)

    # a long input must be truncated to maxRows before being sent
    STATE["case"] = CASES["valid"]
    big = "\n".join(f"row{i},value{i}" for i in range(500))
    page.evaluate("s => window.DFPAssist.plan('csv-cleaner', 'dedup', s)", big)
    page.wait_for_timeout(400)
    sent = json.dumps(STATE["seen"][-1], ensure_ascii=False)
    check("500-row input truncated before sending", "row499" not in sent,
          "row499 leaked" if "row499" in sent else "truncated")
    check("truncation is disclosed to the model", "truncated sample" in sent)

    # -------------------------------------------------------------- 6. no fallout
    print("\n[6] stability")
    check("no page errors or console errors in the whole run", not errors,
          "; ".join(errors[:3]))

    browser.close()

print("\n" + ("ALL CHECKS PASSED" if not fails else f"{len(fails)} FAILED: " + ", ".join(fails)))
mock.shutdown()
static.shutdown()
sys.exit(1 if fails else 0)

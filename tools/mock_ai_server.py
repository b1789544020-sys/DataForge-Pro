"""Shared fake OpenAI-compatible endpoint used by the AI audit scripts.

Importing this module has no side effects beyond defining the servers and the
canned response table; each audit script starts its own instances.
"""
import http.server, socketserver, json, time

# The currently selected scenario. Tests assign STATE["case"] before each call,
# so responses are deterministic instead of depending on call ordering.
STATE = {"case": None, "seen": []}


class MockAI(http.server.BaseHTTPRequestHandler):
    """Minimal OpenAI-compatible /chat/completions stub with CORS enabled."""

    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(n) if n else b"{}"
        try:
            STATE["seen"].append(json.loads(raw.decode("utf-8")))
        except Exception:
            STATE["seen"].append({"_unparsed": raw[:200].decode("utf-8", "replace")})

        case = STATE["case"] or {}
        if case.get("delay"):
            time.sleep(case["delay"])

        payload = json.dumps(case.get("response", {})).encode("utf-8")
        self.send_response(case.get("status", 200))
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


class ThreadedHTTP(socketserver.ThreadingMixIn, http.server.HTTPServer):
    """Threaded so a deliberate response delay cannot block the file server."""
    daemon_threads = True
    allow_reuse_address = True


class QuietStatic(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


class ThreadedStatic(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True


# --------------------------------------------------------------------- scenarios
def reply(content):
    """Wrap model text in a normal OpenAI chat completion envelope."""
    return {"response": {"choices": [{"message": {"role": "assistant",
                                                  "content": content}}]}}


def as_json(obj):
    return reply(json.dumps(obj, ensure_ascii=False))


CASES = {
    # ---- well-formed answers the remote engine must accept ------------------
    "valid": as_json({
        "options": {"dedup": True, "trim": True, "caseMode": "lower"},
        "explain": "Remove duplicate rows, trim spaces, lower-case everything.",
        "warnings": ["Removal cannot be undone"],
    }),
    "fenced": reply("Sure, here you go:\n```json\n" + json.dumps({
        "options": {"dropEmptyRows": True, "normalizeWhitespace": True},
        "explain": "Drop blank rows and collapse runs of spaces.",
    }) + "\n```\nHope that helps!"),
    "single_quote_prose": reply(
        "I think these settings fit: {\"options\": {\"stripHTML\": true}, "
        "\"explain\": \"Strip tags.\"} — let me know."),

    # ---- hostile / sloppy answers sanitizePatch must clean up ---------------
    "unknown_keys": as_json({
        "options": {"dedup": True, "rmRf": "/", "__proto__": {"x": 1},
                    "imageQuality": 90},
        "explain": "Contains keys this tool does not have.",
    }),
    "wrong_types": as_json({
        "options": {"dedup": "yes", "trim": 1, "caseMode": "SHOUTING",
                    "fillEmpty": 42},
        "explain": "Types do not match the schema.",
    }),
    "options_not_object": as_json({
        "options": ["dedup", "trim"],
        "explain": "options is an array, not an object.",
    }),
    "no_options": as_json({"explain": "Nothing to change."}),

    # ---- transport / protocol failures -> must fall back offline ------------
    "http_401": {"status": 401, "response": {
        "error": {"message": "Incorrect API key provided", "code": "invalid_api_key"}}},
    "http_500": {"status": 500, "response": {
        "error": {"message": "internal server error"}}},
    "not_json_at_all": reply("I'm a chat model and I'd rather explain it in words."),
    "empty_content": reply(""),
    "no_choices": {"response": {"choices": []}},
    "timeout": dict(delay=3, **reply("far too late")),

    # ---- answers for the non-plan entry points -----------------------------
    "diagnose_ok": as_json({
        "summary": "6 rows, 3 columns; the Email column is inconsistent.",
        "findings": ["Row 2 and row 4 are identical",
                     "Name has leading/trailing spaces",
                     "'not-an-email' is not a valid address"],
        "options": {"dedup": True, "trim": True, "validateEmail": "mark"},
    }),
    "explain_ok": reply("- Removed 1 duplicate row\n- Trimmed spaces in 3 cells"),
    "recommend_ok": as_json({"picks": [
        {"id": "dedup-merge", "why": "Merges several tables and drops duplicates."},
        {"id": "csv-cleaner", "why": "Cleans up the merged result."},
        {"id": "not-a-real-tool", "why": "Should be filtered out."},
    ]}),

    # ---- plan used by the UI flow test -------------------------------------
    # Deliberately mixes two options that are already on by default (dedup,
    # trim) with two that are off (normalizeWhitespace, caseMode), so the diff
    # must mark the first pair "unchanged" and Apply has a provable effect.
    "ui_plan": as_json({
        "options": {"dedup": True, "trim": True,
                    "normalizeWhitespace": True, "caseMode": "lower"},
        "explain": "Drop the duplicate row, squeeze spaces and lower-case it.",
        "warnings": [],
    }),
}

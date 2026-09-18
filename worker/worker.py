"""
Local browser worker for the AI Job Application Agent.

The web app does the reading, understanding, mapping and approval. This worker is
the only part that touches a real browser: it signs in as YOU, picks up runs you
have approved, fills the real form with Playwright, uploads your exact resume
file, and pauses whenever the site asks for an OTP or a human check.

It never bypasses CAPTCHA, OTP or MFA, never invents an answer, and never marks a
run submitted unless the site itself confirms it.

Usage:
    pip install -r requirements.txt
    playwright install chromium
    export SUPABASE_URL=... SUPABASE_ANON_KEY=... AGENT_EMAIL=... AGENT_PASSWORD=...
    python worker.py
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path
from typing import Any

import httpx
from playwright.sync_api import sync_playwright, Page, TimeoutError as PWTimeout


def _load_env_file() -> None:
    """Read config from a .env file sitting next to worker.py (beginner-friendly).

    Real environment variables always win over the file.
    """
    env_path = Path(__file__).resolve().parent / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip().strip('"').strip("'")
        if key and value and key not in os.environ:
            os.environ[key] = value


_load_env_file()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
EMAIL = os.environ.get("AGENT_EMAIL", "")
PASSWORD = os.environ.get("AGENT_PASSWORD", "")
POLL_SECONDS = int(os.environ.get("POLL_SECONDS", "10"))

_missing = [
    name
    for name, val in [
        ("SUPABASE_URL", SUPABASE_URL),
        ("SUPABASE_ANON_KEY", ANON_KEY),
        ("AGENT_EMAIL", EMAIL),
        ("AGENT_PASSWORD", PASSWORD),
    ]
    if not val
]
if _missing:
    sys.exit(
        "Missing settings: "
        + ", ".join(_missing)
        + "\nCreate a file called .env in the worker folder (copy .env.example) and fill it in."
    )

CONFIRMATION_PHRASES = [
    "application submitted",
    "thank you for applying",
    "your application has been received",
    "thanks for applying",
    "we have received your application",
    "application complete",
]


class Api:
    """Thin Supabase REST client that acts as the signed-in user (RLS applies)."""

    def __init__(self) -> None:
        self.client = httpx.Client(timeout=30)
        self.token = self._sign_in()

    def _sign_in(self) -> str:
        response = self.client.post(
            f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
            headers={"apikey": ANON_KEY, "content-type": "application/json"},
            json={"email": EMAIL, "password": PASSWORD},
        )
        response.raise_for_status()
        return response.json()["access_token"]

    def _headers(self, extra: dict[str, str] | None = None) -> dict[str, str]:
        headers = {
            "apikey": ANON_KEY,
            "authorization": f"Bearer {self.token}",
            "content-type": "application/json",
        }
        if extra:
            headers.update(extra)
        return headers

    def select(self, table: str, query: str) -> list[dict[str, Any]]:
        response = self.client.get(
            f"{SUPABASE_URL}/rest/v1/{table}?{query}", headers=self._headers()
        )
        response.raise_for_status()
        return response.json()

    def patch(self, table: str, query: str, payload: dict[str, Any]) -> None:
        response = self.client.patch(
            f"{SUPABASE_URL}/rest/v1/{table}?{query}",
            headers=self._headers({"prefer": "return=minimal"}),
            json=payload,
        )
        response.raise_for_status()

    def insert(self, table: str, payload: dict[str, Any]) -> None:
        response = self.client.post(
            f"{SUPABASE_URL}/rest/v1/{table}",
            headers=self._headers({"prefer": "return=minimal"}),
            json=payload,
        )
        response.raise_for_status()

    def download_resume(self, storage_path: str, target: str) -> str:
        response = self.client.get(
            f"{SUPABASE_URL}/storage/v1/object/resumes/{storage_path}",
            headers={"apikey": ANON_KEY, "authorization": f"Bearer {self.token}"},
        )
        response.raise_for_status()
        with open(target, "wb") as handle:
            handle.write(response.content)
        return target


EXTRACT_FIELDS_JS = r"""
() => {
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  const labelFor = (el) => {
    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) return clean(label.textContent);
    }
    const aria = el.getAttribute("aria-label");
    if (aria) return clean(aria);
    let parent = el.parentElement;
    for (let depth = 0; parent && depth < 4; depth += 1) {
      const label = parent.querySelector("label, legend");
      if (label) {
        const value = clean(label.textContent);
        if (value) return value;
      }
      parent = parent.parentElement;
    }
    return clean(el.getAttribute("placeholder") || el.getAttribute("name") || el.id || "Unlabelled field");
  };
  const selectorFor = (el, index) => {
    if (el.id) return `#${CSS.escape(el.id)}`;
    const name = el.getAttribute("name");
    if (name) return `${el.tagName.toLowerCase()}[name="${name}"]`;
    return `${el.tagName.toLowerCase()}:nth-of-type(${index + 1})`;
  };
  const fields = [];
  const seen = new Set();
  document.querySelectorAll("input, select, textarea").forEach((el, index) => {
    const tag = el.tagName.toLowerCase();
    const rawType = (el.getAttribute("type") || "").toLowerCase();
    if (tag === "input" && ["hidden", "submit", "button", "reset", "image"].includes(rawType)) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0 && rawType !== "file") return;
    const type = tag === "textarea" ? "textarea"
      : tag === "select" ? (el.multiple ? "multiselect" : "select")
      : rawType || "text";
    let label = labelFor(el);
    const selector = selectorFor(el, index);
    const key = `${type}::${label}::${selector}`;
    if (seen.has(key)) return;
    seen.add(key);
    const required = el.required || el.getAttribute("aria-required") === "true" || /\*\s*$/.test(label);
    const options = tag === "select"
      ? Array.from(el.querySelectorAll("option")).map((o) => clean(o.textContent)).filter(Boolean).slice(0, 40)
      : [];
    fields.push({ label: label.replace(/\s*\*\s*$/, "").slice(0, 200), selector, type, required, options });
  });
  return fields.slice(0, 120);
}
"""


def step(api: Api, application_id: str, state: str, status: str, detail: str | None = None) -> None:
    api.patch(
        "run_steps",
        f"application_id=eq.{application_id}&state=eq.{state}",
        {"status": status, "detail": detail},
    )


def log(
    api: Api,
    application: dict[str, Any],
    message: str,
    level: str = "info",
    stage: str | None = None,
) -> None:
    """Mirror the worker's console output into the app so the user can watch it there."""
    print(f"[{level}] {message}")
    try:
        api.insert(
            "worker_logs",
            {
                "user_id": application["user_id"],
                "application_id": application["id"],
                "level": level,
                "stage": stage,
                "message": message[:1000],
            },
        )
    except Exception as error:  # noqa: BLE001 - never let logging break a run
        print(f"(could not send log to the app: {error})")



def wait_for_human(label: str) -> None:
    print(f"\n*** {label} ***")
    print("Complete it in the browser window that is open, then press Enter here.")
    try:
        input()
    except EOFError:
        print("No interactive terminal; leaving the run paused.")
        raise SystemExit(1)


def looks_like_captcha(page: Page) -> bool:
    html = page.content().lower()
    return any(
        token in html for token in ("recaptcha", "hcaptcha", "cf-turnstile", "are you a robot")
    )


def looks_like_otp(page: Page) -> bool:
    html = page.content().lower()
    return any(
        token in html
        for token in ("one-time code", "one time password", "verification code", "enter the code we sent")
    )


def best_option(value: str, options: list[str]) -> str | None:
    """Pick the option on the page that matches the approved value most closely."""
    wanted = value.strip().lower()
    for option in options:
        if option.strip().lower() == wanted:
            return option
    for option in options:
        text = option.strip().lower()
        if text and (text in wanted or wanted in text):
            return option
    return None


def fill_field(page: Page, mapping: dict[str, Any], resume_path: str | None) -> tuple[bool, str | None]:
    selector = mapping["field_selector"]
    field_type = mapping["field_type"]
    value = mapping.get("mapped_value")
    options = [o for o in (mapping.get("options") or []) if isinstance(o, str)]

    try:
        locator = page.locator(selector).first
        if locator.count() == 0:
            locator = page.get_by_label(mapping["field_label"], exact=False).first
        locator.wait_for(state="visible", timeout=8000)
        try:
            locator.scroll_into_view_if_needed(timeout=3000)
        except Exception:
            pass

        if field_type == "file":
            if not resume_path:
                return False, "no resume file available"
            locator.set_input_files(resume_path)
            return True, None
        if value is None:
            return False, "no approved value"

        if field_type in ("select", "multiselect"):
            page_options = [
                (o or "").strip()
                for o in locator.locator("option").all_inner_texts()
            ]
            match = best_option(value, page_options or options)
            try:
                locator.select_option(label=match or value)
            except Exception:
                locator.select_option(value=match or value)
            return True, None

        if field_type == "checkbox":
            if value.strip().lower() in ("yes", "true", "1", "on", "i agree", "agree", "accept"):
                locator.check()
            else:
                locator.uncheck()
            return True, None

        if field_type == "radio":
            try:
                page.get_by_role("radio", name=value, exact=False).first.check()
            except Exception:
                match = best_option(value, options) or value
                page.get_by_text(match, exact=False).first.click()
            return True, None

        locator.fill(value)
        # Autocomplete / combobox inputs only commit once a suggestion is chosen.
        if options or locator.get_attribute("role") == "combobox" or locator.get_attribute("aria-autocomplete"):
            page.wait_for_timeout(900)
            suggestion = page.locator("[role=option], li[role=option], .select__option").first
            if suggestion.count() > 0:
                try:
                    suggestion.click()
                except Exception:
                    locator.press("Enter")
        return True, None
    except PWTimeout:
        return False, "field not found on the live page"
    except Exception as error:  # noqa: BLE001 - surfaced to the app, not swallowed
        return False, str(error)[:300]


def process(api: Api, page: Page, application: dict[str, Any]) -> None:
    application_id = application["id"]
    print(f"\n=== Run {application_id}: {application.get('role_title') or application['job_url']}")

    mappings = api.select(
        "field_mappings",
        f"application_id=eq.{application_id}&order=created_at.asc",
    )
    resume_path = None
    if application.get("resume_id"):
        resumes = api.select("resumes", f"id=eq.{application['resume_id']}&select=storage_path,file_name")
        if resumes:
            resume_path = api.download_resume(
                resumes[0]["storage_path"], f"/tmp/{resumes[0]['file_name']}"
            )

    log(api, application, f"Opening {application['job_url']}", stage="OPEN_JOB")
    step(api, application_id, "OPEN_JOB", "running")
    page.goto(application["job_url"], wait_until="domcontentloaded", timeout=60000)
    step(api, application_id, "OPEN_JOB", "done", page.url)
    log(api, application, f"Page loaded: {page.title()[:120]}", stage="OPEN_JOB")

    if looks_like_captcha(page):
        step(api, application_id, "HANDLE_VERIFICATION", "waiting", "Human verification required")
        log(api, application, "Human verification shown — waiting for you", "warn", "HANDLE_VERIFICATION")
        wait_for_human("Human verification required")
        step(api, application_id, "HANDLE_VERIFICATION", "done", "Completed by you")
        log(api, application, "Human verification completed by you", stage="HANDLE_VERIFICATION")

    step(api, application_id, "FILL_FIELDS", "running")
    failures: list[str] = []
    for mapping in mappings:
        if mapping["action"] != "fill":
            continue
        ok, error = fill_field(page, mapping, resume_path)
        api.patch(
            "field_mappings",
            f"id=eq.{mapping['id']}",
            {"fill_status": "filled" if ok else "failed", "validation_error": error},
        )
        log(
            api,
            application,
            f"{'Filled' if ok else 'Could not fill'} “{mapping['field_label']}”"
            + ("" if ok else f" — {error}"),
            "info" if ok else "warn",
            "FILL_FIELDS",
        )
        if not ok and mapping["is_required"]:
            failures.append(f"{mapping['field_label']}: {error}")
        if mapping["field_type"] == "file" and ok:
            step(api, application_id, "UPLOAD_RESUME", "done", application.get("resume_file_name"))
            log(api, application, f"Uploaded {application.get('resume_file_name')}", stage="UPLOAD_RESUME")


    if failures:
        step(api, application_id, "FILL_FIELDS", "failed", "; ".join(failures)[:500])
        log(api, application, "Stopped: " + "; ".join(failures)[:400], "error", "FILL_FIELDS")
        api.patch(
            "applications",
            f"id=eq.{application_id}",
            {
                "status": "needs_input",
                "agent_state": "HANDLE_MISSING_INFORMATION",
                "notes": "Some required fields could not be filled on the live page: "
                + "; ".join(failures)[:400],
            },
        )
        return
    step(api, application_id, "FILL_FIELDS", "done", f"{len(mappings)} fields")
    log(api, application, f"All {len(mappings)} fields handled", stage="FILL_FIELDS")

    if looks_like_otp(page):
        step(api, application_id, "HANDLE_VERIFICATION", "waiting", "One-time code required")
        log(api, application, "One-time code required — waiting for you", "warn", "HANDLE_VERIFICATION")
        wait_for_human("One-time code required")
        step(api, application_id, "HANDLE_VERIFICATION", "done", "Entered by you")

    step(api, application_id, "SUBMIT", "running")
    submitted = False
    for name in ("Submit application", "Submit Application", "Submit", "Apply", "Send application"):
        button = page.get_by_role("button", name=name, exact=False)
        if button.count() > 0:
            button.first.click()
            submitted = True
            log(api, application, f"Clicked the site's “{name}” button", stage="SUBMIT")
            break

    if not submitted:
        step(api, application_id, "SUBMIT", "failed", "No submit button was found on the page")
        log(api, application, "No submit button was found on the page", "error", "SUBMIT")
        api.patch(
            "applications",
            f"id=eq.{application_id}",
            {"status": "failed", "notes": "The submit button could not be found on the live page."},
        )

        return

    page.wait_for_timeout(6000)
    step(api, application_id, "SUBMIT", "done", "Clicked the site's submit button")
    step(api, application_id, "VERIFY_SUBMISSION", "running")

    body = page.locator("body").inner_text().lower()
    confirmation = next((phrase for phrase in CONFIRMATION_PHRASES if phrase in body), None)

    if confirmation:
        step(api, application_id, "VERIFY_SUBMISSION", "done", confirmation)
        api.patch(
            "applications",
            f"id=eq.{application_id}",
            {
                "status": "submitted",
                "agent_state": "COMPLETED",
                "confirmation_message": confirmation,
                "submitted_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            },
        )
        api.insert(
            "audit_log",
            {
                "user_id": application["user_id"],
                "application_id": application_id,
                "action": "submission_confirmed",
                "detail": confirmation,
            },
        )
        log(api, application, f"Site confirmed: “{confirmation}”", stage="VERIFY_SUBMISSION")
        print("Submitted and confirmed by the site.")

    else:
        step(
            api,
            application_id,
            "VERIFY_SUBMISSION",
            "failed",
            "No confirmation message was found after submitting",
        )
        api.patch(
            "applications",
            f"id=eq.{application_id}",
            {
                "status": "failed",
                "agent_state": "VERIFY_SUBMISSION",
                "notes": "The submit button was clicked but the site showed no confirmation. "
                "Check the browser window before applying again.",
            },
        )
        log(
            api,
            application,
            "Submit was clicked but the site showed no confirmation — not recorded as submitted",
            "error",
            "VERIFY_SUBMISSION",
        )
        print("No confirmation found — not recorded as submitted.")



def inspect_live(api: Api, page: Page, application: dict[str, Any]) -> None:
    """JavaScript-rendered sites: read the live form and hand the fields back.

    The web app then maps them against the user's data. Nothing is filled or
    submitted here — this pass only reads.
    """
    application_id = application["id"]
    print(f"\n=== Reading live form for run {application_id}")

    log(api, application, f"Opening {application['job_url']} to read the live form", stage="OPEN_JOB")
    step(api, application_id, "OPEN_JOB", "running")
    page.goto(application["job_url"], wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(4000)


    # Job description pages often reveal the form only after clicking Apply.
    if len(page.evaluate(EXTRACT_FIELDS_JS)) < 3:
        for name in ("Apply now", "Apply", "Apply for this job", "Start application"):
            button = page.get_by_role("button", name=name, exact=False)
            link = page.get_by_role("link", name=name, exact=False)
            target = button if button.count() > 0 else link
            if target.count() > 0:
                try:
                    target.first.click()
                    page.wait_for_timeout(5000)
                except Exception:
                    pass
                break

    if looks_like_captcha(page) or looks_like_otp(page):
        step(api, application_id, "HANDLE_VERIFICATION", "waiting", "Human verification required")
        log(api, application, "Human verification shown — waiting for you", "warn", "HANDLE_VERIFICATION")
        wait_for_human("Human verification required")
        step(api, application_id, "HANDLE_VERIFICATION", "done", "Completed by you")

    fields = page.evaluate(EXTRACT_FIELDS_JS)
    step(api, application_id, "OPEN_JOB", "done", page.url)
    step(api, application_id, "INSPECT_APPLICATION", "done", page.title())
    log(api, application, f"Read {len(fields)} fields on {page.url}", stage="EXTRACT_FIELDS")

    if len(fields) < 3:
        step(api, application_id, "EXTRACT_FIELDS", "failed", "No form found even in the live browser")
        log(api, application, "No application form found even in a real browser", "error", "EXTRACT_FIELDS")
        api.patch(
            "applications",
            f"id=eq.{application_id}",
            {
                "status": "needs_input",
                "agent_state": "INSPECT_APPLICATION",
                "notes": "Even in a real browser no application form was found on that page. "
                "Open the site yourself, reach the actual form, and paste its URL as a new application.",
            },
        )
        return


    api.insert(
        "field_mappings",
        [
            {
                "user_id": application["user_id"],
                "application_id": application_id,
                "field_label": field["label"],
                "field_selector": field["selector"],
                "field_type": field["type"],
                "is_required": field["required"],
                "options": field["options"],
                "source": "unavailable",
                "confidence": 0,
                "action": "needs_mapping",
                "fill_status": "pending",
            }
            for field in fields
        ],
    )
    step(api, application_id, "EXTRACT_FIELDS", "done", f"{len(fields)} fields read in the live browser")
    api.patch(
        "applications",
        f"id=eq.{application_id}",
        {
            "status": "mapping_fields",
            "agent_state": "MAP_FIELDS",
            "job_url": page.url,
            "page_snapshot": {"final_url": page.url, "title": page.title(), "field_count": len(fields), "js_rendered": True},
            "notes": None,
        },
    )
    print(f"Read {len(fields)} fields. Open the run in the app and choose 'Analyze detected fields'.")


def main() -> None:
    api = Api()
    print("Worker signed in. Waiting for approved applications…")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=False)
        context = browser.new_context(viewport={"width": 1400, "height": 1000})
        page = context.new_page()
        while True:
            try:
                pending = api.select(
                    "applications",
                    "status=eq.waiting_for_worker&order=created_at.asc&limit=1",
                )
                if not pending:
                    time.sleep(POLL_SECONDS)
                    continue
                application = pending[0]
                inspect_only = application.get("agent_state") == "INSPECT_APPLICATION"
                api.patch(
                    "applications",
                    f"id=eq.{application['id']}",
                    {"worker_claimed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                     "agent_state": application.get("agent_state") if inspect_only else "FILL_FIELDS"},
                )
                if inspect_only:
                    inspect_live(api, page, application)
                else:
                    process(api, page, application)
            except KeyboardInterrupt:
                print("Stopping.")
                sys.exit(0)
            except Exception as error:  # noqa: BLE001
                print(f"Worker error: {error}")
                time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()

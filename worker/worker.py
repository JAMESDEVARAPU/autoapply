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
from typing import Any

import httpx
from playwright.sync_api import sync_playwright, Page, TimeoutError as PWTimeout

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
ANON_KEY = os.environ["SUPABASE_ANON_KEY"]
EMAIL = os.environ["AGENT_EMAIL"]
PASSWORD = os.environ["AGENT_PASSWORD"]
POLL_SECONDS = int(os.environ.get("POLL_SECONDS", "10"))

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


def step(api: Api, application_id: str, state: str, status: str, detail: str | None = None) -> None:
    api.patch(
        "run_steps",
        f"application_id=eq.{application_id}&state=eq.{state}",
        {"status": status, "detail": detail},
    )


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


def fill_field(page: Page, mapping: dict[str, Any], resume_path: str | None) -> tuple[bool, str | None]:
    selector = mapping["field_selector"]
    field_type = mapping["field_type"]
    value = mapping.get("mapped_value")

    try:
        locator = page.locator(selector).first
        if locator.count() == 0:
            locator = page.get_by_label(mapping["field_label"], exact=False).first
        locator.wait_for(state="visible", timeout=8000)

        if field_type == "file":
            if not resume_path:
                return False, "no resume file available"
            locator.set_input_files(resume_path)
            return True, None
        if value is None:
            return False, "no approved value"
        if field_type in ("select", "multiselect"):
            locator.select_option(label=value)
            return True, None
        if field_type == "checkbox":
            if value.strip().lower() in ("yes", "true", "1", "on"):
                locator.check()
            else:
                locator.uncheck()
            return True, None
        if field_type == "radio":
            page.get_by_role("radio", name=value, exact=False).first.check()
            return True, None
        locator.fill(value)
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

    step(api, application_id, "OPEN_JOB", "running")
    page.goto(application["job_url"], wait_until="domcontentloaded", timeout=60000)
    step(api, application_id, "OPEN_JOB", "done", page.url)

    if looks_like_captcha(page):
        step(api, application_id, "HANDLE_VERIFICATION", "waiting", "Human verification required")
        wait_for_human("Human verification required")
        step(api, application_id, "HANDLE_VERIFICATION", "done", "Completed by you")

    step(api, application_id, "FILL_FIELDS", "running")
    failures: list[str] = []
    for mapping in mappings:
        if mapping["action"] == "skip":
            continue
        ok, error = fill_field(page, mapping, resume_path)
        api.patch(
            "field_mappings",
            f"id=eq.{mapping['id']}",
            {"fill_status": "filled" if ok else "failed", "validation_error": error},
        )
        if not ok and mapping["is_required"]:
            failures.append(f"{mapping['field_label']}: {error}")
        if mapping["field_type"] == "file" and ok:
            step(api, application_id, "UPLOAD_RESUME", "done", application.get("resume_file_name"))

    if failures:
        step(api, application_id, "FILL_FIELDS", "failed", "; ".join(failures)[:500])
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

    if looks_like_otp(page):
        step(api, application_id, "HANDLE_VERIFICATION", "waiting", "One-time code required")
        wait_for_human("One-time code required")
        step(api, application_id, "HANDLE_VERIFICATION", "done", "Entered by you")

    step(api, application_id, "SUBMIT", "running")
    submitted = False
    for name in ("Submit application", "Submit Application", "Submit", "Apply", "Send application"):
        button = page.get_by_role("button", name=name, exact=False)
        if button.count() > 0:
            button.first.click()
            submitted = True
            break
    if not submitted:
        step(api, application_id, "SUBMIT", "failed", "No submit button was found on the page")
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
        print("No confirmation found — not recorded as submitted.")


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
                api.patch(
                    "applications",
                    f"id=eq.{application['id']}",
                    {"worker_claimed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                     "agent_state": "FILL_FIELDS"},
                )
                process(api, page, application)
            except KeyboardInterrupt:
                print("Stopping.")
                sys.exit(0)
            except Exception as error:  # noqa: BLE001
                print(f"Worker error: {error}")
                time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()

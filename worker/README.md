# Browser worker

The web app reads the job form, matches it to your saved details, asks you about
anything it does not know, and holds the approved application. This worker is the
only piece that drives a real browser — it runs on your own machine so you can see
the live window and complete any one-time code or human check yourself.

Nothing is ever marked as submitted unless the website itself shows a confirmation.

## Run it

```bash
cd worker
pip install -r requirements.txt
playwright install chromium

export SUPABASE_URL="https://<your-cloud-url>"
export SUPABASE_ANON_KEY="<publishable key>"
export AGENT_EMAIL="you@example.com"       # the account you use in the app
export AGENT_PASSWORD="<your app password>"

python worker.py
```

The `SUPABASE_URL` and `SUPABASE_ANON_KEY` values are the same ones the app uses
(`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env`).

## What it does

1. Signs in as you, so it can only ever see your own data.
2. Polls for applications you approved in the app ("Waiting for browser worker").
3. Opens the job page in a visible Chromium window.
4. Fills each approved field — text, number, email, phone, date, textarea,
   dropdown, radio, checkbox and multi-select — using the values the app prepared.
5. Uploads the exact resume file you uploaded. It never edits or replaces it.
6. Pauses and waits for you on human verification and one-time codes. It never
   tries to bypass them, and it never stores a code.
7. Clicks the site's own submit button, then reads the page back for a real
   confirmation ("Application submitted", "Thank you for applying", …). Without a
   confirmation the run is recorded as failed, never as submitted.
8. Writes every step back to the app so the progress panel stays live.

## Docker

```bash
docker build -t job-agent-worker .
docker run --rm -it \
  -e SUPABASE_URL -e SUPABASE_ANON_KEY -e AGENT_EMAIL -e AGENT_PASSWORD \
  job-agent-worker
```

A visible browser inside Docker needs a forwarded display, so running it directly
on your machine is the simpler option when a site asks for verification.

## Safety

- No CAPTCHA, OTP, MFA or anti-bot bypassing.
- No invented answers: the worker only fills values you or your own documents
  supplied and that you approved in the app.
- No credentials or codes are written to the app's logs.

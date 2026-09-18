# Browser worker

The web app reads the job form, matches it to your saved details, asks you about
anything it does not know, and holds the approved application. This worker is the
only piece that drives a real browser — it runs on your own machine so you can see
the live window and complete any one-time code or human check yourself.

Nothing is ever marked as submitted unless the website itself shows a confirmation.

## Run it (step by step)

**1. Get the code.** Download the repo as a ZIP from
`github.com/JAMESDEVARAPU/autoapply` (green **Code** button → **Download ZIP**),
then unzip it somewhere easy, e.g. your Desktop.

**2. Install Python.** From `python.org/downloads` install Python 3.10 or newer.
On the first installer screen, tick **"Add python.exe to PATH"** (Windows) before
clicking Install.

**3. Open a terminal in the `worker` folder.** In the unzipped folder, open the
`worker` folder, then:
- Windows: click the address bar at the top, type `powershell` and press Enter.
- Mac: right-click the folder → **New Terminal at Folder** (or Services → New
  Terminal at Folder).

**4. Install what the worker needs (one time):**

```bash
pip install -r requirements.txt
playwright install chromium
```

**5. Create your settings file.** In the `worker` folder you'll find
`.env.example`. Copy it, rename the copy to `.env` (make sure it's not
`.env.txt`), open it in Notepad/TextEdit and add just two things:

- `AGENT_EMAIL` — the email you sign into this website with.
- `AGENT_PASSWORD` — your website password.

(The cloud address lines are already filled in.) Save the file.

**6. Start the worker:**

```bash
python worker.py
```

A Chromium window opens. Leave the terminal running. The worker checks every few
seconds for runs waiting on it, opens the job page, and fills it while you watch.
If the site shows a one-time code or a human check, the worker pauses and waits
for you — type the code into the real website's window, and it continues.

Meanwhile, this website's run page shows a live **Worker activity** panel with
everything the worker is doing.

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
9. Streams its own activity into the app's "Worker activity" panel, so you can watch
   what it is doing from the website without looking at this terminal.

## Troubleshooting

- `python is not recognized` — Python wasn't added to PATH; reinstall and tick
  "Add python.exe to PATH", or use `py worker.py` instead of `python worker.py`.
- `Missing settings: ...` — your `.env` file is missing some values, or it was
  saved as `.env.txt`. Rename it to exactly `.env`.
- Nothing happens — make sure the run in the website says "Waiting for browser
  worker" and you clicked the final **Submit** approval in the run page first.

## Docker (optional)

```bash
docker build -t job-agent-worker .
docker run --rm -it --env-file .env job-agent-worker
```

A visible browser inside Docker needs a forwarded display, so running it directly
on your machine is the simpler option when a site asks for verification.

## Safety

- No CAPTCHA, OTP, MFA or anti-bot bypassing.
- No invented answers: the worker only fills values you or your own documents
  supplied and that you approved in the app.
- No credentials or codes are written to the app's logs. Keep `.env` private and
  never commit it.

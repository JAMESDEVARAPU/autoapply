FROM mcr.microsoft.com/playwright/python:v1.48.0-jammy

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY worker.py ./

# Runs with a visible browser by default so you can complete OTP / human checks.
# For a headed browser inside Docker you must forward a display; otherwise run
# the worker directly on your machine with `python worker.py`.
CMD ["python", "worker.py"]

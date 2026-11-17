# PhishSafe — Phishing Awareness Training Simulator

[![Live Demo](https://img.shields.io/badge/Live_Demo-Open_PhishSafe-4f46e5?style=for-the-badge)](https://nana-kwame1.github.io/phishing-awareness-simulator/)

A safe phishing-awareness simulator built with **Python Flask** and **SQLite**, plus a **browser-only GitHub Pages demo**.

**Live demo:** https://nana-kwame1.github.io/phishing-awareness-simulator/

> **Safety:** This app does **not** send real email and **never stores** usernames or passwords typed into the fake login page. Use it only with people who have agreed to participate in training.

## Live demo vs. full app

- **GitHub Pages demo** (`docs/`): runs entirely in the browser with `localStorage`. It is the public demo link above.
- **Full Flask app** (`app.py`): uses a SQLite database and runs locally. Use the setup instructions below.

GitHub Pages cannot run Python/Flask, so the hosted demo is a static version of the same workflow.

## Features

- Create campaigns with one or more participants
- Three built-in scenarios: shared document, password reset, invoice
- Unique tracking link per participant
- Simulated inbox instead of outbound email delivery
- Event tracking: email opened, link clicked, fake form submitted, reported, training completed
- Campaign dashboard with click rate and response counts
- Participant-level results and recent activity timeline
- Reset or delete campaigns

## Setup

From this folder:

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python app.py
```

Then open:

```text
http://127.0.0.1:5000
```

The database is created automatically at `phishing_simulator.db`. To use a different location, set `PHISH_SIM_DB` before starting the app.

For a non-development secret key:

```powershell
$env:FLASK_SECRET_KEY = "replace-with-a-long-random-value"
.\.venv\Scripts\python app.py
```

## Open in VS Code

From this folder:

```powershell
code .
```

The workspace includes:

- Python interpreter set to `.venv`
- **Run PhishSafe Flask app** launch configuration
- **Run Flask app** and **Serve GitHub Pages demo** tasks
- Recommended extensions for Python, Flask debugging, Live Server, and Prettier

To run the Flask app in VS Code, open the **Run and Debug** panel and choose **Run PhishSafe Flask app**.

## How to run a simulation

1. Open **Dashboard → New campaign**.
2. Name the campaign and choose a scenario.
3. Add participants, one per line:
   ```text
   Ada Lovelace, ada@example.com
   grace@example.com
   ```
4. Click **Create campaign**.
5. Open **Simulated inbox** and open a message, or copy a participant’s unique link from the campaign page.
6. As the participant:
   - click the email call-to-action, or
   - press **Report phishing**
7. On the fake sign-in page, enter anything or nothing — values are discarded — and press **Continue**.
8. Complete the micro-lesson.
9. Return to the campaign page to see the recorded events.

## Project structure

```text
app.py                     Flask app, routes, database helpers
requirements.txt           Python dependencies
docs/                      Static GitHub Pages demo
  index.html
  app.js
  style.css
templates/
  base.html                Admin layout
  base_sim.html            Participant-facing layout with safety banner
  dashboard.html           Campaign overview
  campaign_new.html        Campaign creation form
  campaign_view.html       Campaign results and controls
  inbox.html               Simulated inbox
  email.html               Simulated email message
  landing.html             Fake sign-in page
  training.html            Training micro-lesson
static/
  style.css                All styling
phishing_simulator.db      SQLite database (created at runtime)
```

## Notes for extension

Good next features:

- Multiple training modules with a quiz score
- CSV export of results
- Login for the admin dashboard
- Custom email template builder
- Scheduled campaign launch and reminder messages
- Department/team breakdowns

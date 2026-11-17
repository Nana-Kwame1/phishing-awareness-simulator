from __future__ import annotations

import os
import secrets
import sqlite3
from datetime import datetime, timezone

from flask import Flask, abort, flash, g, redirect, render_template, request, url_for

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get(
    "PHISH_SIM_DB", os.path.join(BASE_DIR, "phishing_simulator.db")
)

TEMPLATES = {
    "shared_doc": {
        "label": "Shared document",
        "subject": "Action required: document shared with you",
        "sender_name": "Maya Chen",
        "sender_email": "maya.chen@doc-share.example",
        "preview": "A document was shared with you. Please review it today.",
        "cta": "Review document",
        "landing_title": "Secure Document Portal",
        "landing_note": "Sign in to view the shared document.",
    },
    "password_reset": {
        "label": "Password reset",
        "subject": "Your account access needs attention",
        "sender_name": "IT Support",
        "sender_email": "support@account-alert.example",
        "preview": "We detected unusual activity. Verify your account now.",
        "cta": "Verify account",
        "landing_title": "Account Verification",
        "landing_note": "Confirm your details to restore access.",
    },
    "invoice": {
        "label": "Invoice / payment",
        "subject": "Invoice ready for your approval",
        "sender_name": "Billing Team",
        "sender_email": "billing@invoice-portal.example",
        "preview": "An invoice is waiting for your approval.",
        "cta": "Open invoice",
        "landing_title": "Invoice Portal",
        "landing_note": "Sign in to approve the attached invoice.",
    },
}

EVENT_LABELS = {
    "opened": "Opened email",
    "clicked": "Clicked link",
    "submitted": "Submitted fake form",
    "reported": "Reported as phishing",
    "completed_training": "Completed training",
}

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "local-dev-only-change-me")

SCHEMA = """
CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    template_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    launched_at TEXT
);

CREATE TABLE IF NOT EXISTS participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    detail TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_participants_campaign ON participants(campaign_id);
CREATE INDEX IF NOT EXISTS idx_events_participant ON events(participant_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
"""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(exception=None) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    with app.app_context():
        db = get_db()
        db.executescript(SCHEMA)
        db.commit()


def log_event(participant_id: int, event_type: str, detail: str | None = None) -> None:
    db = get_db()
    db.execute(
        "INSERT INTO events (participant_id, event_type, detail, created_at) VALUES (?, ?, ?, ?)",
        (participant_id, event_type, detail, now_iso()),
    )
    db.commit()


def get_participant(token: str) -> sqlite3.Row:
    row = get_db().execute(
        """
        SELECT p.*, c.name AS campaign_name, c.template_key, c.launched_at
        FROM participants p
        JOIN campaigns c ON c.id = p.campaign_id
        WHERE p.token = ?
        """,
        (token,),
    ).fetchone()
    if row is None:
        abort(404)
    return row


def campaign_stats(campaign_id: int) -> dict[str, int]:
    db = get_db()
    total = db.execute(
        "SELECT COUNT(*) FROM participants WHERE campaign_id = ?", (campaign_id,)
    ).fetchone()[0]
    rows = db.execute(
        """
        SELECT e.event_type, COUNT(DISTINCT e.participant_id) AS count
        FROM events e
        JOIN participants p ON p.id = e.participant_id
        WHERE p.campaign_id = ?
        GROUP BY e.event_type
        """,
        (campaign_id,),
    ).fetchall()
    counts = {row["event_type"]: row["count"] for row in rows}
    result = {"total": total}
    for key in EVENT_LABELS:
        result[key] = counts.get(key, 0)
    return result


def parse_recipients(raw: str) -> list[tuple[str, str]]:
    recipients: list[tuple[str, str]] = []
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        if "," in line:
            name, email = (part.strip() for part in line.split(",", 1))
        else:
            email = line
            name = email.split("@", 1)[0]
        if "@" in email and "." in email.split("@", 1)[-1]:
            recipients.append((name, email))
    return recipients


@app.route("/")
def home():
    return redirect(url_for("dashboard"))


@app.route("/dashboard")
def dashboard():
    campaigns = get_db().execute(
        """
        SELECT c.*,
            (SELECT COUNT(*) FROM participants p WHERE p.campaign_id = c.id) AS participant_count,
            (SELECT COUNT(DISTINCT e.participant_id) FROM events e JOIN participants p ON p.id = e.participant_id
             WHERE p.campaign_id = c.id AND e.event_type = 'opened') AS opened_count,
            (SELECT COUNT(DISTINCT e.participant_id) FROM events e JOIN participants p ON p.id = e.participant_id
             WHERE p.campaign_id = c.id AND e.event_type = 'clicked') AS clicked_count,
            (SELECT COUNT(DISTINCT e.participant_id) FROM events e JOIN participants p ON p.id = e.participant_id
             WHERE p.campaign_id = c.id AND e.event_type = 'submitted') AS submitted_count,
            (SELECT COUNT(DISTINCT e.participant_id) FROM events e JOIN participants p ON p.id = e.participant_id
             WHERE p.campaign_id = c.id AND e.event_type = 'reported') AS reported_count
        FROM campaigns c
        ORDER BY c.created_at DESC, c.id DESC
        """
    ).fetchall()
    return render_template("dashboard.html", campaigns=campaigns, templates=TEMPLATES)


@app.route("/campaigns/new", methods=["GET", "POST"])
def campaign_new():
    if request.method == "POST":
        name = request.form.get("name", "").strip()
        template_key = request.form.get("template_key", "shared_doc").strip()
        recipients = parse_recipients(request.form.get("recipients", ""))

        if not name:
            flash("Give the campaign a name.", "error")
        elif template_key not in TEMPLATES:
            flash("Choose a valid email template.", "error")
        elif not recipients:
            flash("Add at least one participant email.", "error")
        else:
            db = get_db()
            cursor = db.execute(
                "INSERT INTO campaigns (name, template_key, created_at) VALUES (?, ?, ?)",
                (name, template_key, now_iso()),
            )
            campaign_id = cursor.lastrowid
            db.executemany(
                """
                INSERT INTO participants (campaign_id, name, email, token, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                [
                    (campaign_id, pname, email, secrets.token_urlsafe(18), now_iso())
                    for pname, email in recipients
                ],
            )
            db.commit()
            flash(f"Campaign created with {len(recipients)} participant(s).", "success")
            return redirect(url_for("campaign_view", campaign_id=campaign_id))

    return render_template("campaign_new.html", templates=TEMPLATES)


@app.route("/campaigns/<int:campaign_id>")
def campaign_view(campaign_id: int):
    db = get_db()
    campaign = db.execute("SELECT * FROM campaigns WHERE id = ?", (campaign_id,)).fetchone()
    if campaign is None:
        abort(404)

    participants = db.execute(
        """
        SELECT p.*,
            EXISTS(SELECT 1 FROM events e WHERE e.participant_id = p.id AND e.event_type = 'opened') AS opened,
            EXISTS(SELECT 1 FROM events e WHERE e.participant_id = p.id AND e.event_type = 'clicked') AS clicked,
            EXISTS(SELECT 1 FROM events e WHERE e.participant_id = p.id AND e.event_type = 'submitted') AS submitted,
            EXISTS(SELECT 1 FROM events e WHERE e.participant_id = p.id AND e.event_type = 'reported') AS reported,
            EXISTS(SELECT 1 FROM events e WHERE e.participant_id = p.id AND e.event_type = 'completed_training') AS trained
        FROM participants p
        WHERE p.campaign_id = ?
        ORDER BY p.id
        """,
        (campaign_id,),
    ).fetchall()

    events = db.execute(
        """
        SELECT e.*, p.name AS participant_name, p.email AS participant_email
        FROM events e
        JOIN participants p ON p.id = e.participant_id
        WHERE p.campaign_id = ?
        ORDER BY e.created_at DESC, e.id DESC
        LIMIT 100
        """,
        (campaign_id,),
    ).fetchall()

    return render_template(
        "campaign_view.html",
        campaign=campaign,
        participants=participants,
        events=events,
        stats=campaign_stats(campaign_id),
        template=TEMPLATES[campaign["template_key"]],
        event_labels=EVENT_LABELS,
    )


@app.route("/campaigns/<int:campaign_id>/launch", methods=["POST"])
def campaign_launch(campaign_id: int):
    db = get_db()
    if db.execute("SELECT 1 FROM campaigns WHERE id = ?", (campaign_id,)).fetchone() is None:
        abort(404)
    db.execute("UPDATE campaigns SET launched_at = ? WHERE id = ?", (now_iso(), campaign_id))
    db.commit()
    flash("Campaign marked as launched. Share the simulated inbox links from the participant list.", "success")
    return redirect(url_for("campaign_view", campaign_id=campaign_id))


@app.route("/campaigns/<int:campaign_id>/reset", methods=["POST"])
def campaign_reset(campaign_id: int):
    db = get_db()
    db.execute(
        "DELETE FROM events WHERE participant_id IN (SELECT id FROM participants WHERE campaign_id = ?)",
        (campaign_id,),
    )
    db.execute("UPDATE campaigns SET launched_at = NULL WHERE id = ?", (campaign_id,))
    db.commit()
    flash("Tracking data reset for this campaign.", "success")
    return redirect(url_for("campaign_view", campaign_id=campaign_id))


@app.route("/campaigns/<int:campaign_id>/delete", methods=["POST"])
def campaign_delete(campaign_id: int):
    db = get_db()
    db.execute("DELETE FROM campaigns WHERE id = ?", (campaign_id,))
    db.commit()
    flash("Campaign deleted.", "success")
    return redirect(url_for("dashboard"))


@app.route("/inbox")
def inbox():
    participants = get_db().execute(
        """
        SELECT p.*, c.name AS campaign_name, c.template_key, c.launched_at
        FROM participants p
        JOIN campaigns c ON c.id = p.campaign_id
        ORDER BY p.id DESC
        """
    ).fetchall()
    return render_template("inbox.html", participants=participants, templates=TEMPLATES)


@app.route("/go/<token>")
def open_email(token: str):
    participant = get_participant(token)
    log_event(participant["id"], "opened", "Simulated email opened")
    return render_template(
        "email.html",
        participant=participant,
        template=TEMPLATES[participant["template_key"]],
    )


@app.route("/phish/<token>", methods=["GET", "POST"])
def landing(token: str):
    participant = get_participant(token)
    if request.method == "POST":
        log_event(
            participant["id"],
            "submitted",
            "Fake form submitted. No entered values were stored.",
        )
        return redirect(url_for("training", token=token, reason="submitted"))

    log_event(participant["id"], "clicked", "Clicked email call-to-action")
    return render_template(
        "landing.html",
        participant=participant,
        template=TEMPLATES[participant["template_key"]],
    )


@app.route("/report/<token>", methods=["POST"])
def report(token: str):
    participant = get_participant(token)
    log_event(participant["id"], "reported", "Marked the message as suspicious")
    return redirect(url_for("training", token=token, reason="reported"))


@app.route("/training/<token>", methods=["GET", "POST"])
def training(token: str):
    participant = get_participant(token)
    reason = request.args.get("reason", "opened")
    template = TEMPLATES[participant["template_key"]]
    if request.method == "POST":
        log_event(participant["id"], "completed_training", "Training page completed")
        return render_template(
            "training.html",
            participant=participant,
            template=template,
            reason=reason,
            completed=True,
        )
    return render_template(
        "training.html",
        participant=participant,
        template=template,
        reason=reason,
        completed=False,
    )


init_db()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)

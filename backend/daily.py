"""The daily e-mail: verse of the day plus the admin's thought, sent once a day to verified, subscribed users."""
from datetime import date, datetime, time as dtime
from html import escape
import os
import re
import threading
import time
from itsdangerous import BadSignature, URLSafeSerializer
from . import mailer

ENGLISH, HINDI = "21", "17"  # Shri Purohit Swami and Swami Tejomayananda: the translations the audio narrates
EPOCH = date(1970, 1, 1)


def verse_of_day(catalog, day):
    """Same choice as the website's verse of the day (frontend/src/domain.js dayVerse)."""
    total = sum(catalog.counts.values())
    index = (((day - EPOCH).days * 2654435761) % total)
    for chapter in sorted(catalog.counts):
        if index < catalog.counts[chapter]:
            return chapter, index + 1
        index -= catalog.counts[chapter]
    return 2, 47


def site_url():
    return os.environ.get("GITA_SITE_URL", "").strip().rstrip("/")


def unsubscribe_token(app, user_id):
    return URLSafeSerializer(app.secret_key, salt="unsubscribe").dumps(user_id)


def read_unsubscribe_token(app, token):
    try:
        return int(URLSafeSerializer(app.secret_key, salt="unsubscribe").loads(token))
    except (BadSignature, ValueError, TypeError):
        return None


def compose(app, user, day, thought=None):
    """Return (subject, text, html, headers) for one user."""
    catalog = app.extensions["catalog"]
    chapter, verse = verse_of_day(catalog, day)
    row = catalog.chapter(chapter)[verse - 1]
    meta = catalog.meta["chapters"][chapter - 1]
    raw = re.sub(r"\s*।।\s*[\d.]+\s*।।", "।।", row["text"].replace("\\n", "\n"))
    sanskrit = "\n".join(" ".join(line.split()) for line in raw.split("\n") if line.strip())
    english, hindi = row["translations"][ENGLISH], row["translations"][HINDI]
    name = (user["name"] or user["email"].split("@")[0]).strip()
    base = site_url()
    link = f"{base}/read/{chapter}/{verse}" if base else ""
    unsub = f"{base}/api/unsubscribe?token={unsubscribe_token(app, user['id'])}" if base else ""
    heading = f"Chapter {chapter} · {meta['title']} · Verse {verse}"
    thought_title = (thought["title"] if thought else "") or "A thought for today"
    text = [f"Namaste {name},", "", "Your verse from the Bhagavad Gita today", heading, "", sanskrit, "", english, "", hindi, ""]
    if thought:
        text += [thought_title, thought["message"], ""]
    if link:
        text += [f"Read and listen to this verse: {link}", ""]
    text += ["You receive this because you have an account on Gita Path."]
    text += [f"Stop daily e-mails: {unsub}"] if unsub else ["You can switch daily e-mails off in your account on the website."]
    h = lambda s: escape(s).replace("\n", "<br>")
    html = f"""<div style="font-family:Georgia,serif;max-width:560px;margin:auto;color:#2b2118;line-height:1.55">
<p>Namaste {h(name)},</p>
<p style="color:#7a5a2a;font-size:14px;margin-bottom:4px">Your verse from the Bhagavad Gita today</p>
<p style="font-size:13px;color:#6b5d4d;margin-top:0">{h(heading)}</p>
<p style="font-size:22px;line-height:1.7;background:#f6efe1;padding:16px 18px;border-radius:10px">{h(sanskrit)}</p>
<p style="font-size:17px">{h(english)}</p>
<p style="font-size:17px">{h(hindi)}</p>"""
    if thought:
        html += f"""<div style="border-left:3px solid #c9822b;padding:2px 14px;margin:22px 0"><strong>{h(thought_title)}</strong><br>{h(thought['message'])}</div>"""
    if link:
        html += f"""<p><a href="{escape(link)}" style="color:#7a4a12">Read and listen to this verse</a></p>"""
    html += """<hr style="border:0;border-top:1px solid #e3d8c3"><p style="font-size:12px;color:#7d7060">You receive this because you have an account on Gita Path. """
    html += f"""<a href="{escape(unsub)}" style="color:#7d7060">Stop daily e-mails</a></p></div>""" if unsub else "You can switch daily e-mails off in your account on the website.</p></div>"
    headers = {"List-Unsubscribe": f"<{unsub}>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"} if unsub else {}
    return f"Gita Path · Verse of the day · {chapter}.{verse}", "\n".join(text), html, headers


def local_now():
    name = os.environ.get("GITA_TIMEZONE", "Asia/Kolkata")
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo(name))
    except Exception:  # missing tz database: fall back to UTC rather than failing
        return datetime.utcnow()


def daily_time():
    try:
        hour, minute = os.environ.get("GITA_DAILY_TIME", "06:00").split(":")
        return dtime(int(hour), int(minute))
    except ValueError:
        return dtime(6, 0)


_retry = {}  # user id -> (day, failed attempts, earliest next try)
MAX_TRIES_PER_DAY, RETRY_AFTER, STOP_AFTER_FAILURES = 3, 30 * 60, 3


def send_batch(app, open_db, today=None, limit=None):
    """Send today's e-mail to everyone who has not had it yet. Safe to call repeatedly."""
    today = today or local_now().date()
    stamp = today.isoformat()
    conn = open_db()
    sent = failed = 0
    try:
        thought = conn.execute("SELECT title, message FROM thoughts WHERE active = 1 ORDER BY id DESC LIMIT 1").fetchone()
        users = conn.execute("SELECT id, email, name FROM users WHERE email_verified = 1 AND daily_email = 1 AND COALESCE(last_sent, '') != ?", (stamp,)).fetchall()
        in_a_row = 0
        for user in users[:limit]:
            day, tries, next_try = _retry.get(user["id"], (stamp, 0, 0))
            if day == stamp and (tries >= MAX_TRIES_PER_DAY or next_try > time.time()):
                continue  # failed recently: do not hammer the mail server
            if in_a_row >= STOP_AFTER_FAILURES:
                print("Daily e-mail: stopping after repeated failures; will try again later.", flush=True)
                break
            try:
                subject, text, html, headers = compose(app, user, today, thought)
                mailer.send(user["email"], subject, text, html, headers)
                conn.execute("UPDATE users SET last_sent = ? WHERE id = ?", (stamp, user["id"]))
                conn.commit()
                sent += 1
                in_a_row = 0
                _retry.pop(user["id"], None)
                time.sleep(0.2)  # stay under provider rate limits
            except Exception as error:  # one bad address must not stop the rest
                failed += 1
                in_a_row += 1
                tries = (tries + 1) if day == stamp else 1
                _retry[user["id"]] = (stamp, tries, time.time() + RETRY_AFTER * tries)
                print(f"Daily e-mail to user {user['id']} failed (try {tries} of {MAX_TRIES_PER_DAY}): {mailer.explain(error)}", flush=True)
    finally:
        conn.close()
    return sent, failed


def start_scheduler(app, open_db):
    """Background thread: once the daily time has passed, send to anyone not yet sent today."""
    def loop():
        while True:
            try:
                now = local_now()
                if now.time() >= daily_time():
                    sent, failed = send_batch(app, open_db, now.date())
                    if sent or failed:
                        print(f"Daily e-mail: {sent} sent, {failed} failed.", flush=True)
            except Exception as error:
                print(f"Daily e-mail scheduler error: {error}", flush=True)
            time.sleep(60)

    thread = threading.Thread(target=loop, name="gita-daily-email", daemon=True)
    thread.start()
    return thread

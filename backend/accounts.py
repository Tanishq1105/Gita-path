"""Accounts, public user count and admin announcements (SQLite, standard library only).

Security notes
--------------
* Passwords are stored only as salted scrypt hashes (werkzeug.security).
* Sessions are signed, HttpOnly, SameSite=Lax cookies. Set GITA_SECURE_COOKIES=1 behind HTTPS.
* State-changing requests must be JSON and, when the browser sends an Origin header,
  that origin must match the host (basic CSRF protection on top of SameSite).
* The admin is NOT chosen by e-mail address at registration time. It is created at start-up
  from the secrets GITA_ADMIN_EMAIL and GITA_ADMIN_PASSWORD, and that address cannot be
  registered by anyone else.
* Failed log-ins are rate limited per client address and e-mail.
"""
from pathlib import Path
from urllib.parse import urlparse
import os
import re
import secrets
import threading
import time
import hashlib
import hmac
from flask.sessions import SecureCookieSessionInterface
from flask import Blueprint, Response, abort, current_app, g, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash
from . import daily, database, mailer

bp = Blueprint("accounts", __name__)
EMAIL = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{2,}$")
CODE_TTL, CODE_COOLDOWN, CODE_ATTEMPTS = 15 * 60, 60, 5
_init_lock = threading.Lock()
_failures = {}  # (ip, email) -> [timestamps]
MAX_FAILURES, WINDOW = 8, 15 * 60


def load_dotenv(root):
    """Read GITA_* settings from a `.env` file in the project folder (real environment variables win)."""
    path = Path(root) / ".env"
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.replace("export ", "").strip()
        if key.startswith("GITA_") and key not in os.environ:
            os.environ[key] = clean_setting(value)


def clean_setting(value):
    """Windows `set VAR='x'` keeps the quotes and trailing spaces; drop both."""
    value = (value or "").strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
        value = value[1:-1].strip()
    return value


def admin_settings(app):
    email = clean_setting(os.environ.get("GITA_ADMIN_EMAIL") or app.config.get("ADMIN_EMAIL")).lower()
    password = clean_setting(os.environ.get("GITA_ADMIN_PASSWORD") or app.config.get("ADMIN_PASSWORD"))
    return email, password


def database_path(app):
    return Path(app.config.get("DATABASE") or os.environ.get("GITA_DB_PATH") or app.config["ROOT"] / "instance/gita.db")


def database_label(app):
    return "PostgreSQL (DATABASE_URL)" if database.url(app) else str(database_path(app))


def get_db():
    if "db" not in g:
        init_database(current_app)
        g.db = database.connect(current_app, database_path(current_app))
    return g.db


def open_db(app):
    """A separate connection for background threads."""
    init_database(app)
    return database.connect(app, database_path(app))


def init_database(app):
    """Create the tables and the administrator once per application start."""
    if app.extensions.get("accounts_ready"):
        return
    with _init_lock:
        if app.extensions.get("accounts_ready"):
            return
        if not database.url(app):
            database_path(app).parent.mkdir(parents=True, exist_ok=True)
        conn = database.connect(app, database_path(app))
        try:
            database.create_schema(conn)
            email, password = admin_settings(app)
            if email and len(password) >= 8:
                row = conn.execute("SELECT id, password_hash FROM users WHERE email = ?", (email,)).fetchone()
                if row is None:
                    conn.execute("INSERT INTO users (email, name, password_hash, is_admin, created_at, email_verified) VALUES (?, 'Admin', ?, 1, ?, 1)",
                                 (email, generate_password_hash(password), int(time.time())))
                else:
                    updates = ["is_admin = 1", "email_verified = 1"]
                    args = []
                    if not check_password_hash(row["password_hash"], password):
                        updates.append("password_hash = ?")
                        args.append(generate_password_hash(password))
                    conn.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", (*args, row["id"]))
            conn.commit()
        finally:
            conn.close()
        app.extensions["accounts_ready"] = True


def secret_key(app):
    configured = app.config.get("SECRET_KEY") or os.environ.get("GITA_SECRET_KEY")
    if configured:
        return configured
    if database.url(app):  # hosts with an erased disk: keep the signing key in the database so logins survive restarts
        init_database(app)
        db = database.connect(app, database_path(app))
        try:
            row = db.execute("SELECT value FROM app_settings WHERE key = 'secret_key'").fetchone()
            if row is None:
                db.execute("INSERT INTO app_settings (key, value) VALUES ('secret_key', ?) ON CONFLICT (key) DO NOTHING", (secrets.token_hex(32),))
                db.commit()
                row = db.execute("SELECT value FROM app_settings WHERE key = 'secret_key'").fetchone()
            return row["value"]
        finally:
            db.close()
    key_file = database_path(app).parent / "secret.key"
    key_file.parent.mkdir(parents=True, exist_ok=True)
    if not key_file.exists():
        key_file.write_text(secrets.token_hex(32))
        try:
            key_file.chmod(0o600)
        except OSError:
            pass
    return key_file.read_text().strip()


class LazySessions(SecureCookieSessionInterface):
    """Resolve the signing key on first use so importing the app never writes to disk."""

    def get_signing_serializer(self, app):
        if not app.secret_key:
            app.secret_key = secret_key(app)
        return super().get_signing_serializer(app)


def setup(app):
    """Wire the blueprint, session cookie settings and per-request database cleanup."""
    app.config["ROOT"] = Path(app.config.get("ROOT", Path(__file__).resolve().parent.parent))
    app.config.update(
        SESSION_COOKIE_NAME="gita_session",
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=os.environ.get("GITA_SECURE_COOKIES", "") == "1" or bool(app.config.get("SECURE_COOKIES")),
        PERMANENT_SESSION_LIFETIME=60 * 60 * 24 * 30,
    )
    app.session_interface = LazySessions()

    @app.teardown_appcontext
    def close_db(_error):
        conn = g.pop("db", None)
        if conn is not None:
            conn.close()

    app.register_blueprint(bp)
    load_dotenv(app.config["ROOT"])
    report_admin(app)
    start_daily(app)


def report_admin(app):
    """Create the admin at start-up and say plainly whether it worked."""
    email, password = admin_settings(app)
    if not email and not password:
        print("Admin: not configured. Create a file named .env in the project folder with GITA_ADMIN_EMAIL=... and GITA_ADMIN_PASSWORD=... lines.", flush=True)
    elif not EMAIL.match(email):
        print(f"Admin: NOT created. GITA_ADMIN_EMAIL is missing or not a valid e-mail (read as: {email!r}).", flush=True)
    elif len(password) < 8:
        print("Admin: NOT created. GITA_ADMIN_PASSWORD must be at least 8 characters.", flush=True)
    else:
        init_database(app)
        print(f"Admin: ready. Log in with e-mail {email} and your GITA_ADMIN_PASSWORD. Database: {database_label(app)}", flush=True)


def start_daily(app):
    """Start the automatic daily e-mail when e-mail sending is set up (or GITA_DAILY_EMAIL=1)."""
    flag = os.environ.get("GITA_DAILY_EMAIL", "").strip()
    if app.config.get("TESTING") or flag == "0":
        return
    if flag != "1" and not mailer.configured():
        print("Daily e-mail: off (no SMTP settings, so nothing can be sent). Verification codes will be printed here instead.", flush=True)
        return
    app.secret_key = app.secret_key or secret_key(app)
    daily.start_scheduler(app, lambda: open_db(app))
    where = os.environ.get("GITA_TIMEZONE", "Asia/Kolkata")
    note = "" if daily.site_url() else " Set GITA_SITE_URL so e-mails contain links."
    print(f"E-mail: {mailer.describe()}", flush=True)
    print(f"Daily e-mail: on, sent every day after {daily.daily_time().strftime('%H:%M')} ({where}).{note}", flush=True)


def public_user(row):
    return {"id": row["id"], "name": row["name"] or row["email"].split("@")[0], "email": row["email"],
            "isAdmin": bool(row["is_admin"]), "dailyEmail": bool(row["daily_email"])}


def current_user():
    uid = session.get("uid")
    if not uid:
        return None
    return get_db().execute("SELECT * FROM users WHERE id = ? AND email_verified = 1", (uid,)).fetchone()


def no_store(response):
    response.headers["Cache-Control"] = "no-store"
    return response


def json_body():
    if not request.is_json:
        abort(415, description="Send JSON.")
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        abort(400, description="Send a JSON object.")
    return data


def check_origin():
    origin = request.headers.get("Origin")
    if origin and urlparse(origin).netloc != request.host:
        abort(403, description="Cross-site requests are not allowed.")


@bp.before_request
def guard():
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        check_origin()


def throttled(key):
    now = time.time()
    attempts = [t for t in _failures.get(key, []) if now - t < WINDOW]
    _failures[key] = attempts
    return len(attempts) >= MAX_FAILURES


def clean_email(value):
    email = str(value or "").strip().lower()
    if not EMAIL.match(email) or len(email) > 254 or ".." in email:
        abort(400, description="Enter a valid e-mail address.")
    return email


def clean_credentials(data):
    email = clean_email(data.get("email"))
    password = str(data.get("password", ""))
    if not 8 <= len(password) <= 128:
        abort(400, description="Use a password of 8 to 128 characters.")
    return email, password


# ---- e-mail verification ---------------------------------------------------------------

def code_hash(user_id, code):
    key = (current_app.secret_key or secret_key(current_app)).encode()
    return hmac.new(key, f"{user_id}:{code}".encode(), hashlib.sha256).hexdigest()


def issue_code(db, user_id, email):
    """Create and e-mail a 6-digit code. Raises 429 inside the cooldown and 502 when sending fails."""
    now = int(time.time())
    row = db.execute("SELECT sent_at FROM email_codes WHERE user_id = ?", (user_id,)).fetchone()
    if row and now - row["sent_at"] < CODE_COOLDOWN:
        abort(429, description=f"A code was just sent. Please wait {CODE_COOLDOWN - (now - row['sent_at'])} seconds before asking again.")
    code = f"{secrets.randbelow(10**6):06d}"
    db.execute("INSERT INTO email_codes (user_id, code_hash, expires_at, attempts, sent_at) VALUES (?, ?, ?, 0, ?) "
               "ON CONFLICT (user_id) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, sent_at = excluded.sent_at",
               (user_id, code_hash(user_id, code), now + CODE_TTL, now))
    db.commit()
    text = (f"Your Gita Path verification code is {code}\n\nIt works for 15 minutes. If you did not sign up, you can ignore this e-mail.")
    html = (f'<div style="font-family:Georgia,serif;max-width:480px;margin:auto;color:#2b2118"><p>Your Gita Path verification code is</p>'
            f'<p style="font-size:32px;letter-spacing:6px;font-weight:bold">{code}</p>'
            f'<p style="font-size:13px;color:#6b5d4d">It works for 15 minutes. If you did not sign up, you can ignore this e-mail.</p></div>')
    try:
        mailer.send(email, f"{code} is your Gita Path verification code", text, html)
    except Exception as error:
        print(f"Verification e-mail to {email} failed: {mailer.explain(error)}", flush=True)
        abort(502, description="We could not send the verification e-mail. Check the address and try again in a moment.")


@bp.post("/api/auth/register")
def register():
    data = json_body()
    email, password = clean_credentials(data)
    name = " ".join(str(data.get("name", "")).split())[:60]
    db = get_db()
    existing = db.execute("SELECT id, email_verified FROM users WHERE email = ?", (email,)).fetchone()
    if existing and existing["email_verified"]:
        abort(409, description="An account with this e-mail already exists. Log in instead.")
    if existing:  # signed up before but never verified: let them try again
        user_id = existing["id"]
        db.execute("UPDATE users SET name = ?, password_hash = ? WHERE id = ?", (name, generate_password_hash(password), user_id))
    else:
        user_id = db.insert("INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)",
                            (email, name, generate_password_hash(password), int(time.time())))
    db.commit()
    try:
        issue_code(db, user_id, email)
    except Exception as error:
        if getattr(error, "code", None) == 429:  # a code was sent a moment ago: keep going to the code screen
            pass
        else:
            raise
    session.clear()
    return no_store(jsonify(needsVerification=True, email=email)), 202


@bp.post("/api/auth/verify")
def verify():
    data = json_body()
    email = clean_email(data.get("email"))
    code = "".join(ch for ch in str(data.get("code", "")) if ch.isdigit())
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    row = db.execute("SELECT * FROM email_codes WHERE user_id = ?", (user["id"],)).fetchone() if user else None
    if not user or not row or row["expires_at"] < time.time():
        abort(400, description="That code has expired. Ask for a new one.")
    if row["attempts"] >= CODE_ATTEMPTS:
        abort(429, description="Too many wrong codes. Ask for a new one.")
    if not hmac.compare_digest(row["code_hash"], code_hash(user["id"], code)):
        db.execute("UPDATE email_codes SET attempts = attempts + 1 WHERE user_id = ?", (user["id"],))
        db.commit()
        abort(400, description="That code is not correct.")
    db.execute("UPDATE users SET email_verified = 1 WHERE id = ?", (user["id"],))
    db.execute("DELETE FROM email_codes WHERE user_id = ?", (user["id"],))
    db.commit()
    session.clear()
    session.permanent = True
    session["uid"] = user["id"]
    return no_store(jsonify(user=public_user(db.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone())))


@bp.post("/api/auth/resend")
def resend():
    email = clean_email(json_body().get("email"))
    db = get_db()
    user = db.execute("SELECT id, email_verified FROM users WHERE email = ?", (email,)).fetchone()
    if user and not user["email_verified"]:
        issue_code(db, user["id"], email)
    return no_store(jsonify(ok=True))


@bp.post("/api/auth/login")
def login():
    data = json_body()
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))
    key = (request.remote_addr or "?", email)
    if throttled(key):
        abort(429, description="Too many failed attempts. Please wait 15 minutes and try again.")
    db = get_db()
    row = db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        _failures.setdefault(key, []).append(time.time())
        abort(401, description="E-mail or password is not correct.")
    _failures.pop(key, None)
    if not row["email_verified"]:
        try:
            issue_code(db, row["id"], email)
        except Exception as error:
            if getattr(error, "code", None) not in (429, 502):
                raise
        body = jsonify(error={"code": 403, "message": "Please verify your e-mail first. We sent a 6-digit code to your inbox."}, needsVerification=True, email=email)
        return no_store(body), 403
    session.clear()
    session.permanent = True
    session["uid"] = row["id"]
    return no_store(jsonify(user=public_user(row)))


@bp.post("/api/auth/logout")
def logout():
    session.clear()
    return no_store(jsonify(ok=True))


@bp.get("/api/auth/me")
def me():
    row = current_user()
    return no_store(jsonify(user=public_user(row) if row else None))


@bp.post("/api/auth/preferences")
def preferences():
    row = current_user()
    if row is None:
        abort(401, description="Log in first.")
    wanted = json_body().get("dailyEmail")
    if not isinstance(wanted, bool):
        abort(400, description="dailyEmail must be true or false.")
    db = get_db()
    db.execute("UPDATE users SET daily_email = ? WHERE id = ?", (int(wanted), row["id"]))
    db.commit()
    return no_store(jsonify(user=public_user(db.execute("SELECT * FROM users WHERE id = ?", (row["id"],)).fetchone())))


PAGE = ('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gita Path</title>'
        '<body style="font-family:Georgia,serif;max-width:480px;margin:12vh auto;padding:0 20px;color:#2b2118;line-height:1.6">{}</body>')


@bp.route("/api/unsubscribe", methods=["GET", "POST"])
def unsubscribe():
    token = request.values.get("token", "")
    user_id = daily.read_unsubscribe_token(current_app, token) if (current_app.secret_key or secret_key(current_app)) else None
    if user_id is None:
        return Response(PAGE.format("<h2>This link is not valid.</h2><p>Open Gita Path and switch daily e-mails off in your account.</p>"), 400, mimetype="text/html")
    if request.method == "POST":
        db = get_db()
        db.execute("UPDATE users SET daily_email = 0 WHERE id = ?", (user_id,))
        db.commit()
        return Response(PAGE.format("<h2>You are unsubscribed.</h2><p>You will not receive the daily verse e-mail any more. You can turn it back on in your account.</p>"), mimetype="text/html")
    return Response(PAGE.format('<h2>Stop the daily verse e-mail?</h2><form method="post"><input type="hidden" name="token" value="{}">'
                                '<button type="submit" style="font-size:16px;padding:10px 18px">Unsubscribe</button></form>'.format(token.replace('"', ""))), mimetype="text/html")


@bp.get("/api/stats")
def stats():
    count = get_db().execute("SELECT COUNT(*) FROM users WHERE is_admin = 0 AND email_verified = 1").fetchone()[0]
    return no_store(jsonify(users=count))


def thought_json(row):
    return {"id": row["id"], "title": row["title"], "message": row["message"], "createdAt": row["created_at"], "active": bool(row["active"])}


@bp.get("/api/thoughts/today")
def thought_today():
    row = get_db().execute("SELECT * FROM thoughts WHERE active = 1 ORDER BY id DESC LIMIT 1").fetchone()
    return no_store(jsonify(thought=thought_json(row) if row else None))


def require_admin():
    row = current_user()
    if row is None:
        abort(401, description="Log in as admin first.")
    if not row["is_admin"]:
        abort(403, description="Only the administrator can do this.")
    return row


@bp.get("/api/admin/thoughts")
def admin_list():
    require_admin()
    rows = get_db().execute("SELECT * FROM thoughts ORDER BY id DESC LIMIT 100").fetchall()
    return no_store(jsonify(thoughts=[thought_json(r) for r in rows]))


@bp.post("/api/admin/thoughts")
def admin_create():
    admin = require_admin()
    data = json_body()
    message = str(data.get("message", "")).strip()
    title = " ".join(str(data.get("title", "")).split())
    if not 1 <= len(message) <= 600:
        abort(400, description="Write a message of 1 to 600 characters.")
    if len(title) > 80:
        abort(400, description="Keep the heading within 80 characters.")
    db = get_db()
    new_id = db.insert("INSERT INTO thoughts (title, message, created_at, author_id) VALUES (?, ?, ?, ?)", (title, message, int(time.time()), admin["id"]))
    db.commit()
    return no_store(jsonify(thought=thought_json(db.execute("SELECT * FROM thoughts WHERE id = ?", (new_id,)).fetchone()))), 201


@bp.delete("/api/admin/thoughts/<int:identifier>")
def admin_remove(identifier):
    require_admin()
    db = get_db()
    cursor = db.execute("UPDATE thoughts SET active = 0 WHERE id = ?", (identifier,))
    db.commit()
    if cursor.rowcount == 0:
        abort(404, description="Thought not found.")
    return no_store(jsonify(ok=True))


@bp.post("/api/admin/test-email")
def admin_test_email():
    """Send today's daily e-mail to the administrator only, to check the mail settings."""
    admin = require_admin()
    db = get_db()
    thought = db.execute("SELECT title, message FROM thoughts WHERE active = 1 ORDER BY id DESC LIMIT 1").fetchone()
    subject, text, html, headers = daily.compose(current_app, admin, daily.local_now().date(), thought)
    try:
        mode = mailer.send(admin["email"], "[Test] " + subject, text, html, headers)
    except Exception as error:
        abort(502, description=f"E-mail could not be sent: {mailer.explain(error)}")
    return no_store(jsonify(sent=True, mode=mode, to=admin["email"]))

import os
import re
from datetime import date
import pytest
from backend import accounts, create_app, daily, mailer

ADMIN = ("admin@example.com", "admin-secret-1")


@pytest.fixture()
def outbox(monkeypatch):
    sent = []

    def fake_send(to, subject, text, html=None, headers=None):
        sent.append({"to": to, "subject": subject, "text": text, "html": html, "headers": headers or {}})
        return "smtp"

    monkeypatch.setattr(mailer, "send", fake_send)
    return sent


POSTGRES = os.environ.get("GITA_TEST_POSTGRES_URL", "")


@pytest.fixture(params=["sqlite", "postgres"])
def client(request, tmp_path, outbox):
    """Every account test runs on SQLite, and on PostgreSQL too when GITA_TEST_POSTGRES_URL is set."""
    accounts._failures.clear()
    daily._retry.clear()
    config = {"DATABASE": tmp_path / "t.db", "SECRET_KEY": "test-key", "ADMIN_EMAIL": ADMIN[0], "ADMIN_PASSWORD": ADMIN[1],
              "TESTING": True, "ROOT": tmp_path}
    if request.param == "postgres":
        if not POSTGRES:
            pytest.skip("set GITA_TEST_POSTGRES_URL to test against PostgreSQL")
        import psycopg
        with psycopg.connect(POSTGRES, autocommit=True) as reset:  # start from an empty database
            reset.execute("DROP SCHEMA public CASCADE")
            reset.execute("CREATE SCHEMA public")
        config["DATABASE_URL"] = POSTGRES
    return create_app(config).test_client()


def register(client, email="reader@example.com", password="password123", name="Reader"):
    return client.post("/api/auth/register", json={"email": email, "password": password, "name": name})


def last_code(outbox, to):
    mails = [m for m in outbox if m["to"] == to and "verification code" in m["subject"]]
    return re.search(r"\b(\d{6})\b", mails[-1]["subject"])[1]


def signup(client, outbox, email="reader@example.com", password="password123", name="Reader"):
    assert register(client, email, password, name).status_code == 202
    return client.post("/api/auth/verify", json={"email": email, "code": last_code(outbox, email)})


def login(client, email, password):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def test_signup_requires_the_emailed_code(client, outbox):
    response = register(client)
    assert response.status_code == 202 and response.get_json()["needsVerification"] is True
    assert client.get("/api/auth/me").get_json()["user"] is None  # not signed in before verifying
    assert client.get("/api/stats").get_json()["users"] == 0  # unverified addresses are not counted
    assert login(client, "reader@example.com", "password123").status_code == 403
    verified = client.post("/api/auth/verify", json={"email": "reader@example.com", "code": last_code(outbox, "reader@example.com")})
    assert verified.status_code == 200 and verified.get_json()["user"]["dailyEmail"] is True
    assert client.get("/api/auth/me").get_json()["user"]["email"] == "reader@example.com"
    assert client.get("/api/stats").get_json()["users"] == 1


def test_wrong_code_is_rejected_and_locks_after_five_tries(client, outbox):
    register(client)
    for _ in range(5):
        assert client.post("/api/auth/verify", json={"email": "reader@example.com", "code": "000000"}).status_code == 400
    good = last_code(outbox, "reader@example.com")
    assert client.post("/api/auth/verify", json={"email": "reader@example.com", "code": good}).status_code == 429


def test_resend_cooldown_and_unknown_addresses(client, outbox):
    register(client)
    assert client.post("/api/auth/resend", json={"email": "reader@example.com"}).status_code == 429
    assert client.post("/api/auth/resend", json={"email": "nobody@example.com"}).status_code == 200
    assert len(outbox) == 1


def test_unverified_login_resends_code_flag(client, outbox):
    register(client)
    response = login(client, "reader@example.com", "password123")
    assert response.status_code == 403 and response.get_json()["needsVerification"] is True
    assert login(client, "reader@example.com", "wrong-pass").status_code == 401


def test_invalid_emails_never_get_a_code(client, outbox):
    for bad in ["not-an-email", "a@b", "two@@example.com", "dots..here@example.com", "spaces in@example.com", ""]:
        assert register(client, bad).status_code == 400
    assert outbox == []


def test_failed_send_reports_error(client, monkeypatch):
    def boom(*a, **k):
        raise OSError("smtp down")
    monkeypatch.setattr(mailer, "send", boom)
    assert register(client).status_code == 502


def test_login_logout_and_duplicates(client, outbox):
    assert signup(client, outbox).status_code == 200
    assert client.post("/api/auth/logout", json={}).status_code == 200
    assert client.get("/api/auth/me").get_json()["user"] is None
    assert login(client, "READER@example.com", "password123").status_code == 200
    assert register(client, "Reader@Example.com").status_code == 409
    assert register(client, password="short").status_code == 400
    assert client.post("/api/auth/register", data="x", content_type="text/plain").status_code == 415


def test_wrong_password_is_rejected_and_throttled(client, outbox):
    signup(client, outbox)
    client.post("/api/auth/logout", json={})
    for _ in range(8):
        assert login(client, "reader@example.com", "wrong-password").status_code == 401
    assert login(client, "reader@example.com", "password123").status_code == 429


def test_admin_email_cannot_be_taken_by_others(client):
    assert register(client, ADMIN[0], "attacker-pass").status_code == 409
    assert login(client, ADMIN[0], "attacker-pass").status_code == 401
    assert login(client, *ADMIN).get_json()["user"]["isAdmin"] is True
    assert client.get("/api/stats").get_json()["users"] == 0  # admin is not counted as a reader


def test_thought_of_the_day_is_public_but_only_admin_writes(client, outbox):
    assert client.get("/api/thoughts/today").get_json()["thought"] is None
    assert client.post("/api/admin/thoughts", json={"message": "hi"}).status_code == 401
    signup(client, outbox)
    assert client.post("/api/admin/thoughts", json={"message": "hi"}).status_code == 403
    assert client.get("/api/admin/thoughts").status_code == 403
    client.post("/api/auth/logout", json={})
    login(client, *ADMIN)
    assert client.post("/api/admin/thoughts", json={"message": "   "}).status_code == 400
    assert client.post("/api/admin/thoughts", json={"message": "x" * 601}).status_code == 400
    assert client.post("/api/admin/thoughts", json={"message": "ok", "title": "t" * 81}).status_code == 400
    posted = client.post("/api/admin/thoughts", json={"title": "Calm mind", "message": "Act without <b>attachment</b>"})
    assert posted.status_code == 201
    shown = client.application.test_client().get("/api/thoughts/today").get_json()["thought"]
    assert (shown["title"], shown["message"]) == ("Calm mind", "Act without <b>attachment</b>")
    assert client.delete(f"/api/admin/thoughts/{posted.get_json()['thought']['id']}").status_code == 200
    assert client.application.test_client().get("/api/thoughts/today").get_json()["thought"] is None
    assert client.delete("/api/admin/thoughts/999").status_code == 404


def test_cross_site_post_is_blocked(client):
    response = client.post("/api/auth/register", json={"email": "a@b.co", "password": "password123"}, headers={"Origin": "https://evil.example"})
    assert response.status_code == 403


def test_session_cookie_flags(client, outbox):
    cookie = signup(client, outbox).headers["Set-Cookie"]
    assert "HttpOnly" in cookie and "SameSite=Lax" in cookie


def test_admin_login_survives_windows_quotes_and_spaces(tmp_path):
    app = create_app({"DATABASE": tmp_path / "q.db", "SECRET_KEY": "k", "ADMIN_EMAIL": "  Owner@Example.com ", "ADMIN_PASSWORD": "'owner-pass-1' ", "ROOT": tmp_path})
    assert login(app.test_client(), "owner@example.com", "owner-pass-1").get_json()["user"]["isAdmin"] is True


def test_admin_password_change_on_restart_and_short_password_reported(tmp_path, capsys):
    db = tmp_path / "r.db"
    base = {"DATABASE": db, "SECRET_KEY": "k", "ADMIN_EMAIL": "o@example.com", "ROOT": tmp_path}
    create_app({**base, "ADMIN_PASSWORD": "first-pass-1"})
    c = create_app({**base, "ADMIN_PASSWORD": "second-pass-2"}).test_client()
    assert login(c, "o@example.com", "first-pass-1").status_code == 401
    assert login(c, "o@example.com", "second-pass-2").status_code == 200
    capsys.readouterr()
    create_app({"DATABASE": tmp_path / "s.db", "SECRET_KEY": "k", "ADMIN_EMAIL": "o@example.com", "ADMIN_PASSWORD": "short", "ROOT": tmp_path})
    assert "at least 8 characters" in capsys.readouterr().out


def test_admin_settings_can_come_from_dot_env_file(tmp_path, monkeypatch):
    for name in ("GITA_ADMIN_EMAIL", "GITA_ADMIN_PASSWORD"):  # placeholders make pytest remove what .env sets afterwards
        monkeypatch.setenv(name, "x")
        monkeypatch.delenv(name)
    (tmp_path / ".env").write_text("# my settings\nGITA_ADMIN_EMAIL=me@example.com\nGITA_ADMIN_PASSWORD=\"dotenv-pass-1\"\n", encoding="utf-8")
    c = create_app({"ROOT": tmp_path, "DATABASE": tmp_path / "e.db", "SECRET_KEY": "k"}).test_client()
    assert login(c, "me@example.com", "dotenv-pass-1").get_json()["user"]["isAdmin"] is True


def test_old_database_is_migrated_and_existing_users_stay_verified(tmp_path):
    import sqlite3
    db = tmp_path / "old.db"
    conn = sqlite3.connect(db)
    conn.executescript("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL DEFAULT '', password_hash TEXT NOT NULL, is_admin INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);")
    from werkzeug.security import generate_password_hash
    conn.execute("INSERT INTO users (email, password_hash, created_at) VALUES ('old@example.com', ?, 1)", (generate_password_hash("oldpass-123"),))
    conn.commit(); conn.close()
    c = create_app({"DATABASE": db, "SECRET_KEY": "k", "TESTING": True, "ROOT": tmp_path}).test_client()
    assert login(c, "old@example.com", "oldpass-123").status_code == 200


# ---- daily e-mail ------------------------------------------------------------------------

def test_verse_of_day_matches_the_website_formula(client):
    catalog = client.application.extensions["catalog"]
    # frontend/src/domain.js dayVerse(): floor(UTC days) * 2654435761 % 701, walked through the chapters
    days = (date(2026, 11, 19) - date(1970, 1, 1)).days
    index = (days * 2654435761) % 701
    chapter = 1
    while index >= catalog.counts[chapter]:
        index -= catalog.counts[chapter]
        chapter += 1
    assert daily.verse_of_day(catalog, date(2026, 11, 19)) == (chapter, index + 1)


def test_daily_email_content_and_unsubscribe(client, outbox, monkeypatch):
    monkeypatch.setenv("GITA_SITE_URL", "https://gita.example.com/")
    signup(client, outbox, "a@example.com", name="Asha")
    signup(client.application.test_client(), outbox, "b@example.com", name="Bhaskar")
    client.post("/api/auth/logout", json={})
    login(client, *ADMIN)
    client.post("/api/admin/thoughts", json={"title": "Calm mind", "message": "Act without attachment"})
    outbox.clear()
    app = client.application
    sent, failed = daily.send_batch(app, lambda: accounts.open_db(app), date(2026, 11, 19))
    assert (sent, failed) == (3, 0)  # a, b and the admin: all verified and subscribed
    mail = next(m for m in outbox if m["to"] == "a@example.com")
    assert mail["subject"].startswith("Gita Path · Verse of the day ·")
    assert "Namaste Asha" in mail["text"] and "Calm mind" in mail["text"] and "Act without attachment" in mail["text"]
    assert "https://gita.example.com/read/" in mail["text"] and "<html" not in mail["text"] and "Act without attachment" in mail["html"]
    assert "List-Unsubscribe" in mail["headers"]
    # a second run on the same day sends nothing
    outbox.clear()
    assert daily.send_batch(app, lambda: accounts.open_db(app), date(2026, 11, 19)) == (0, 0)
    # next day sends again; unsubscribing stops it
    token = re.search(r"token=([^\s>\"]+)", mail["text"])[1]
    page = client.get(f"/api/unsubscribe?token={token}")
    assert page.status_code == 200 and b"Unsubscribe" in page.data
    assert client.post("/api/unsubscribe", data={"token": token}).status_code == 200
    assert client.post(f"/api/unsubscribe?token={token}x").status_code == 400
    sent, _ = daily.send_batch(app, lambda: accounts.open_db(app), date(2026, 11, 20))
    assert sent == 2 and all(m["to"] != "a@example.com" for m in outbox)


def test_unverified_and_opted_out_users_get_no_daily_mail(client, outbox):
    register(client, "pending@example.com")
    signup(client.application.test_client(), outbox, "optout@example.com")
    c = client.application.test_client()
    login(c, "optout@example.com", "password123")
    assert c.post("/api/auth/preferences", json={"dailyEmail": False}).get_json()["user"]["dailyEmail"] is False
    assert c.post("/api/auth/preferences", json={"dailyEmail": "yes"}).status_code == 400
    outbox.clear()
    app = client.application
    daily.send_batch(app, lambda: accounts.open_db(app), date(2026, 11, 19))
    assert {m["to"] for m in outbox} == {ADMIN[0]}


def test_one_failing_address_does_not_stop_the_batch(client, outbox, monkeypatch):
    signup(client, outbox, "good@example.com")
    signup(client.application.test_client(), outbox, "bad@example.com")
    def flaky(to, *a, **k):
        if to == "bad@example.com":
            raise OSError("mailbox full")
        outbox.append({"to": to, "subject": a[0]})
        return "smtp"
    monkeypatch.setattr(mailer, "send", flaky)
    app = client.application
    sent, failed = daily.send_batch(app, lambda: accounts.open_db(app), date(2026, 11, 19))
    assert failed == 1 and sent == 2
    # the failed address is not retried straight away (back-off), and the good ones are not sent twice
    assert daily.send_batch(app, lambda: accounts.open_db(app), date(2026, 11, 19)) == (0, 0)


def test_admin_test_email_goes_only_to_admin(client, outbox):
    assert client.post("/api/admin/test-email", json={}).status_code == 401
    login(client, *ADMIN)
    outbox.clear()
    response = client.post("/api/admin/test-email", json={})
    assert response.status_code == 200 and response.get_json()["to"] == ADMIN[0]
    assert [m["to"] for m in outbox] == [ADMIN[0]] and outbox[0]["subject"].startswith("[Test]")


def test_outage_stops_the_batch_after_three_failures(client, outbox, monkeypatch):
    for i in range(5):
        signup(client.application.test_client(), outbox, f"u{i}@example.com")
    def down(*a, **k):
        raise OSError("server unreachable")
    monkeypatch.setattr(mailer, "send", down)
    app = client.application
    sent, failed = daily.send_batch(app, lambda: accounts.open_db(app), date(2026, 11, 19))
    assert sent == 0 and failed == 3  # gave up early instead of hammering the mail server


def test_smtp_security_is_guessed_from_the_port_and_errors_are_explained(monkeypatch):
    import smtplib
    monkeypatch.setenv("GITA_SMTP_HOST", "smtp.gmail.com")
    monkeypatch.setenv("GITA_SMTP_USER", "me@gmail.com")
    monkeypatch.delenv("GITA_SMTP_SECURITY", raising=False)
    monkeypatch.setenv("GITA_SMTP_PORT", "465")
    assert mailer.settings()["security"] == "ssl"
    monkeypatch.setenv("GITA_SMTP_PORT", "587")
    assert mailer.settings()["security"] == "starttls"
    assert "App password" in mailer.explain(smtplib.SMTPAuthenticationError(535, b"bad"))
    assert "closed the connection" in mailer.explain(smtplib.SMTPServerDisconnected("Connection unexpectedly closed"))


def test_gmail_app_password_spaces_are_ignored(monkeypatch):
    monkeypatch.setenv("GITA_SMTP_HOST", "smtp.gmail.com")
    monkeypatch.setenv("GITA_SMTP_PASSWORD", "abcd efgh ijkl mnop ")
    assert mailer.settings()["password"] == "abcdefghijklmnop"
    monkeypatch.setenv("GITA_SMTP_HOST", "smtp.example.com")
    assert mailer.settings()["password"] == "abcd efgh ijkl mnop"


@pytest.mark.skipif(not POSTGRES, reason="needs GITA_TEST_POSTGRES_URL")
def test_postgres_keeps_signing_key_in_the_database(tmp_path):
    """On hosts with an erased disk, logins must survive a restart without a key file."""
    import psycopg
    with psycopg.connect(POSTGRES, autocommit=True) as reset:
        reset.execute("DROP SCHEMA public CASCADE")
        reset.execute("CREATE SCHEMA public")
    config = {"DATABASE": tmp_path / "unused.db", "DATABASE_URL": POSTGRES, "ADMIN_EMAIL": ADMIN[0], "ADMIN_PASSWORD": ADMIN[1], "ROOT": tmp_path}
    first = create_app(config).test_client()
    assert login(first, *ADMIN).status_code == 200
    cookie = first.get_cookie("gita_session")
    second = create_app(config).test_client()  # a fresh start of the app
    second.set_cookie("gita_session", cookie.value)
    assert second.get("/api/auth/me").get_json()["user"]["email"] == ADMIN[0]
    assert not (tmp_path / "secret.key").exists()

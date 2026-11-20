"""Send e-mail through any SMTP service, or print it in the terminal while developing.

Settings (environment variables or the .env file):
  GITA_SMTP_HOST, GITA_SMTP_PORT (default 587), GITA_SMTP_USER, GITA_SMTP_PASSWORD,
  GITA_SMTP_FROM (default: the user name), GITA_SMTP_SECURITY = starttls (default) | ssl | none
Without GITA_SMTP_HOST nothing is sent: the message is printed in the terminal instead, so sign-up
and the daily e-mail can be tried on a computer with no mail account.
"""
from email.message import EmailMessage
from email.utils import formataddr, make_msgid, formatdate
import os
import smtplib
import ssl


def app_password(host, value):
    """Google shows App passwords as 'abcd efgh ijkl mnop'; the spaces are not part of it."""
    value = value.strip()
    return "".join(value.split()) if host.endswith("gmail.com") or host.endswith("googlemail.com") else value


def settings():
    host = os.environ.get("GITA_SMTP_HOST", "").strip()
    user = os.environ.get("GITA_SMTP_USER", "").strip()
    sender = os.environ.get("GITA_SMTP_FROM", "").strip() or user
    port = int(os.environ.get("GITA_SMTP_PORT", "587") or 587)
    # Port 465 always means "SSL from the first byte"; 587 and 25 mean STARTTLS. Guess it unless told otherwise.
    security = os.environ.get("GITA_SMTP_SECURITY", "").strip().lower() or ("ssl" if port == 465 else "starttls")
    return {
        "host": host,
        "port": port,
        "user": user,
        "password": app_password(host, os.environ.get("GITA_SMTP_PASSWORD", "")),
        "sender": sender,
        "security": security,
    }


def configured():
    s = settings()
    return bool(s["host"] and s["sender"])


def build(to, subject, text, html=None, headers=None):
    s = settings()
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr(("Gita Path", s["sender"] or "gita-path@localhost"))
    msg["To"] = to
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid(domain=(s["sender"].split("@")[-1] if "@" in s["sender"] else "localhost"))
    for key, value in (headers or {}).items():
        msg[key] = value
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")
    return msg


def send(to, subject, text, html=None, headers=None):
    """Return 'smtp' when really sent or 'console' when printed. Raises OSError/SMTPException on failure."""
    msg = build(to, subject, text, html, headers)
    s = settings()
    if not configured():
        print(f"\n----- E-MAIL (not sent: SMTP is not configured) -----\nTo: {to}\nSubject: {subject}\n\n{text}\n-----------------------------------------------------\n", flush=True)
        return "console"
    if s["security"] == "ssl":
        with smtplib.SMTP_SSL(s["host"], s["port"], timeout=20, context=ssl.create_default_context()) as server:
            if s["user"]:
                server.login(s["user"], s["password"])
            server.send_message(msg)
    else:
        with smtplib.SMTP(s["host"], s["port"], timeout=20) as server:
            if s["security"] != "none":
                server.starttls(context=ssl.create_default_context())
            if s["user"]:
                server.login(s["user"], s["password"])
            server.send_message(msg)
    return "smtp"


def describe():
    """One line for the start-up log: what was read from the settings (never the password)."""
    s = settings()
    if not configured():
        return "not set up (messages are printed in this terminal)"
    return f"{s['host']}:{s['port']} ({s['security']}) as {s['user'] or '(no login)'}, from {s['sender']}"


def explain(error):
    """Turn an SMTP failure into a plain sentence saying what to check."""
    s = settings()
    name = type(error).__name__
    if isinstance(error, smtplib.SMTPAuthenticationError):
        return ("the mail server rejected the user name or password. For Gmail you must use a 16-letter App password "
                "(Google Account > Security > 2-Step Verification > App passwords), not your normal password.")
    if isinstance(error, smtplib.SMTPServerDisconnected):
        return (f"the server at {s['host']}:{s['port']} closed the connection straight away. Check GITA_SMTP_HOST, that the port matches "
                f"({s['security']} is used with port {'465' if s['security'] == 'ssl' else '587'}), and that your account allows SMTP sign-in.")
    if isinstance(error, (smtplib.SMTPSenderRefused, smtplib.SMTPRecipientsRefused)):
        return "the mail server refused the sender or recipient address. Check GITA_SMTP_FROM and the recipient e-mail."
    if isinstance(error, (ConnectionError, TimeoutError, OSError)) and not isinstance(error, smtplib.SMTPException):
        return f"could not reach {s['host']}:{s['port']} ({name}: {error}). Check the host name, the port and your internet or firewall."
    return f"{name}: {error}"

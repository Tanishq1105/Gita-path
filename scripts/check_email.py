"""Find out why e-mail does not send. Run from the project folder:  python scripts/check_email.py

It reads your .env, then tries each step of an SMTP connection and says which one fails.
Nothing is sent; your password is never printed.
"""
from pathlib import Path
import os
import smtplib
import socket
import ssl
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend import accounts, mailer  # noqa: E402

accounts.load_dotenv(ROOT)
s = mailer.settings()
print(f"Settings read: host={s['host'] or '(empty)'} port={s['port']} security={s['security']} user={s['user'] or '(empty)'} "
      f"password={'set, ' + str(len(s['password'])) + ' characters' if s['password'] else 'EMPTY'}")
if not s["host"]:
    sys.exit("GITA_SMTP_HOST is empty: add the GITA_SMTP_* lines to your .env file.")
if s["host"].endswith("gmail.com") and len(s["password"]) != 16:
    print(f"WARNING: a Gmail App password is exactly 16 letters but yours has {len(s['password'])} characters. "
          "A normal Gmail password will NOT work: Gmail hangs up on it. Create an App password (see below).")
if s["password"] != s["password"].strip() or " " in s["password"]:
    print("Note: the password contains spaces. Google shows App passwords in groups of 4 letters; remove the spaces.")


def attempt(port, security):
    print(f"\n--- Trying {s['host']}:{port} with {security} ---")
    try:
        socket.create_connection((s["host"], port), timeout=10).close()
        print("1. Network connection: OK")
    except OSError as e:
        print(f"1. Network connection: FAILED ({e}).\n   Your network or firewall blocks this port. Try a phone hotspot, or another port.")
        return "blocked"
    try:
        ctx = ssl.create_default_context()
        if security == "ssl":
            server = smtplib.SMTP_SSL(s["host"], port, timeout=15, context=ctx)
        else:
            server = smtplib.SMTP(s["host"], port, timeout=15)
        print("2. Server greeting: OK")
        server.ehlo()
        if security == "starttls":
            server.starttls(context=ctx)
            server.ehlo()
            print("3. Secure (TLS) connection: OK")
        else:
            print("3. Secure (TLS) connection: OK")
    except smtplib.SMTPServerDisconnected as e:
        print(f"2/3. The connection was closed before login ({e}).\n   The network connects but something cuts the e-mail connection:"
              " antivirus 'e-mail shield', firewall, college/office proxy.")
        return "cut"
    except Exception as e:
        print(f"2/3. FAILED: {type(e).__name__}: {e}")
        return "error"
    try:
        if s["user"]:
            server.login(s["user"], s["password"])
        print("4. Login: OK  -> this setting works. Put it in your .env and e-mail will send.")
        server.quit()
        return "ok"
    except smtplib.SMTPServerDisconnected:
        print("4. Gmail closed the connection at login. Gmail does this when the login is not accepted: the password is not an App password,"
              " or this Gmail account does not exist / has no 2-Step Verification.")
        return "auth"
    except smtplib.SMTPAuthenticationError as e:
        print(f"4. Login REJECTED ({e.smtp_code}). Use a Gmail App password (16 letters, 2-Step Verification must be on),"
              " and make sure GITA_SMTP_USER is the same Gmail account that created it.")
        return "auth"
    except Exception as e:
        print(f"4. Login FAILED: {type(e).__name__}: {e}")
        return "error"


if s["host"].endswith("gmail.com"):
    print("\nHow to get a Gmail App password: sign in to that Gmail account > myaccount.google.com/security > turn on 2-Step Verification"
          " > open myaccount.google.com/apppasswords > create one named Gita Path > copy the 16 letters into GITA_SMTP_PASSWORD.")
results = {}
for port, security in dict.fromkeys([(s["port"], s["security"]), (587, "starttls"), (465, "ssl")]):
    results[(port, security)] = attempt(port, security)
    if results[(port, security)] == "ok":
        break
print("\nSummary:", ", ".join(f"{p}/{m} = {r}" for (p, m), r in results.items()))
if all(r == "blocked" for r in results.values()):
    print("Every port is blocked from this computer/network. This is usually a college or office network. Use a mobile hotspot to test.")
elif all(r in ("cut", "blocked") for r in results.values()):
    print("Connections open but are cut. Turn off your antivirus e-mail/web shield for a moment and test again, or use a hotspot.")

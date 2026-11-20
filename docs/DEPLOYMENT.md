# Deploying Gita Path

> **Free hosting:** see "Free hosting (Render free + Neon)" below. It keeps data in a free hosted Postgres database,
> so nothing is lost when the free host erases its disk.

Gita Path is one container: Flask serves the API, the audio and the built React app. Accounts and the
thought of the day are stored in one SQLite file, so the host **must give the container a persistent disk or
volume** (mounted at `/data`). Without it, every redeploy would erase all accounts.

## Settings (environment variables)

| Variable | Purpose |
|---|---|
| `GITA_ADMIN_EMAIL`, `GITA_ADMIN_PASSWORD` | Your administrator log-in (password at least 8 characters). Created at start-up; nobody else can register that e-mail. Change the password by changing the variable and restarting. |
| `GITA_SECRET_KEY` | Long random string that signs log-in cookies. Generate one: `python -c "import secrets;print(secrets.token_hex(32))"` |
| `DATABASE_URL` | Optional. A PostgreSQL address (`postgresql://user:password@host/db?sslmode=require`). When set, accounts live there instead of in a file, so no persistent disk is needed. |
| `GITA_DB_PATH` | Database file, `/data/gita.db` in the container. |
| `GITA_SECURE_COOKIES=1` | Send log-in cookies over HTTPS only. Use it on any real site. |
| `GITA_SMTP_HOST`, `GITA_SMTP_PORT`, `GITA_SMTP_USER`, `GITA_SMTP_PASSWORD` | **Required on a real site.** Any SMTP service (Gmail app password, Brevo, Mailgun, Amazon SES, Zoho...). Without them no verification code can be e-mailed and nobody can sign up. Optional `GITA_SMTP_FROM`, `GITA_SMTP_SECURITY` (`starttls` or `ssl`). |
| `GITA_SITE_URL` | Your public address, e.g. `https://gita.example.com`. Used for links and the unsubscribe link in e-mails. |
| `GITA_DAILY_TIME`, `GITA_TIMEZONE` | When the daily e-mail goes out; default `06:00` and `Asia/Kolkata`. |
| `GITA_BEHIND_PROXY=1` | Trust the host's HTTPS proxy headers (Render, Fly, Railway, nginx). |

## Render (included `render.yaml`)

1. Push this project to GitHub.
2. Render dashboard: **New + > Blueprint**, choose the repository.
3. Enter `GITA_ADMIN_EMAIL` and `GITA_ADMIN_PASSWORD` when asked, then apply. The blueprint uses a paid
   *Starter* instance because a persistent disk is required.
4. Open the URL Render gives you, click **Log in**, sign in as admin, then **Write the thought of the day**. Use **Send me today's daily e-mail as a test** to check your mail settings.

## Any Docker host (VPS, Fly.io, Railway)

```bash
docker build -t gita-path .
docker run -d -p 80:5000 -v gita-data:/data \
  -e GITA_ADMIN_EMAIL=you@example.com -e GITA_ADMIN_PASSWORD='choose-a-strong-one' \
  -e GITA_SECRET_KEY="$(python -c 'import secrets;print(secrets.token_hex(32))')" \
  gita-path
```
Put HTTPS in front (Caddy, nginx or the platform proxy) and add `-e GITA_SECURE_COOKIES=1 -e GITA_BEHIND_PROXY=1`.

## Operating notes

* Run **one** instance. SQLite is not meant for several app servers writing at once.
* Back up `/data/gita.db` regularly (copy the file).
* Passwords are stored only as salted hashes. There is no e-mail password reset yet; the admin can
  be recovered by changing `GITA_ADMIN_PASSWORD`.
* The image contains about 300 MB of audio, so the first build and upload take a few minutes.

## E-mail notes

* Sender: use an address you control. For many readers, use a transactional service (Brevo, Mailgun, SES) rather than a
  personal Gmail account; Gmail limits sending to about 500 messages a day.
* Daily e-mails go out once per user per day, shortly after `GITA_DAILY_TIME`. If the server was off then, they are sent
  when it comes back up the same day.
* For good inbox delivery, send from a domain with SPF and DKIM set up (your mail service shows how).

## Free hosting (Render free + Neon + Brevo)

All three have free plans. Together they keep accounts and the thought of the day safe without paying for a disk.

1. **Database (Neon).** Sign up at neon.com (no card needed), create a project, and copy the **connection string**
   (it starts with `postgresql://` and ends with `?sslmode=require`). The free plan has 1 GB of storage and the database
   sleeps after 5 idle minutes, which only adds a short delay to the first request. Check Neon's site for current limits.
2. **Mail (Brevo).** Use `smtp-relay.brevo.com`, port **2525**: Render's free plan blocks ports 25, 465 and 587.
3. **Host (Render).** Push the project to GitHub, then in Render choose **New + > Blueprint**, select the repo and set the
   Blueprint file path to `render.free.yaml` (or make a Web Service by hand: Docker, Free instance, same settings).
   Fill in the values it asks for: `DATABASE_URL` (the Neon string), the Brevo login, key and sender, and your admin
   e-mail and password. When Render shows your address, set `GITA_SITE_URL` to it.
4. **Keep it awake (optional).** A free Render service sleeps after 15 idle minutes, and the first visit then takes about a
   minute. It also means the 6 AM daily e-mail only goes out if the app is awake. A free pinger such as cron-job.org that
   opens `https://YOUR-SITE/api/health` every 10 minutes fixes both (it uses more of the free monthly hours).

Test on your own computer first with a Neon string in `.env`: `DATABASE_URL=postgresql://...`.

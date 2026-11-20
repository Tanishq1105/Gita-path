# Gita Path REST API

Responses use UTF-8 JSON. Unknown/invalid references return `{"error":{"code":404,"message":"..."}}`. Invalid parameters return status 400. All endpoints are read-only and require no credentials.

| Method   | Endpoint                                                       | Response                                                  |
| -------- | -------------------------------------------------------------- | --------------------------------------------------------- |
| GET      | `/api/health`                                                  | status, app version, edition counts                       |
| GET      | `/api/chapters`                                                | edition, all chapter metadata, translators, commentators  |
| GET      | `/api/chapters/2`                                              | chapter metadata and its complete verse list              |
| GET      | `/api/verses/2/47`                                             | one verse with translations keyed by author ID            |
| GET      | `/api/commentary/2/16`                                         | verse-number-to-commentary map for author 16              |
| GET/HEAD | `/api/audio/2/47.mp3`                                          | original MPEG audio; conditional/range requests supported |
| GET      | `/api/search?q=karma&lang=english&chapter=2&limit=20&offset=0` | results, total, offset and limit                          |

## Search parameters

- `q`: up to 200 characters. References include `2.47`, `2:47`, `BG 2/47`, or chapter-only `2`.
- `lang`: `all`, `sanskrit`, `transliteration`, `english`, `hindi`.
- `chapter`: optional 1–18.
- `limit`: 1–50, default 20.
- `offset`: 0–701, default 0.

Matching is case-insensitive and normalises Latin diacritics, spaces and hyphens while retaining Devanagari vowel signs. Each verse is returned once, with the first matching text/translator and a snippet. Search covers all seven translations. Chapter/language filters also apply to reference queries.

## Verse schema

```json
{
  "id": 94,
  "chapter": 2,
  "verse": 47,
  "text": "Original Sanskrit text",
  "transliteration": "Roman transliteration",
  "wordMeanings": "Source word meanings",
  "translations": { "16": "English translation", "1": "Hindi translation" }
}
```

Every imported verse has seven translation entries; this example shows only two for brevity. Author names and language membership are provided by `/api/chapters`.

## Audio and caching

`Range: bytes=0-63` produces HTTP 206 and `Content-Range`; out-of-range requests produce 416. HEAD returns metadata without audio bytes. Text responses use ETags and conditional 304 responses. Health responses are not cached.

## Personal data

No API receives bookmarks, notes or backups. These stay in the browser. Backup files have an `app: "gita-path"` wrapper and a versioned data schema. The frontend validates byte size, reference bounds, translator membership, numeric ranges and timestamps before showing the replacement confirmation.


## Audio tracks

`GET /api/audio/<track>/<chapter>/<verse>.mp3` where `track` is `sa` (Sanskrit recitation), `hi` (Hindi), `en` (English) or `chant` (original slow chant). `GET /api/audio/<chapter>/<verse>.mp3` still returns the slow chant. All support HTTP range requests. Track metadata is in `audioTracks` of `/api/chapters`.


## Accounts, daily e-mail and thought of the day

All state-changing calls take JSON. Responses are `no-store`.

| Method and path | Who | Purpose |
|---|---|---|
| `POST /api/auth/register` | anyone | `{email, password, name?}`; e-mails a 6-digit code, returns 202 `{needsVerification, email}` |
| `POST /api/auth/verify` | anyone | `{email, code}`; 5 wrong tries lock the code; signs in and returns `{user}` |
| `POST /api/auth/resend` | anyone | `{email}`; new code, at most one per minute |
| `POST /api/auth/login` | anyone | `{email, password}`; 403 `needsVerification` if the e-mail is not verified; 8 failures per 15 minutes are blocked (429) |
| `POST /api/auth/logout`, `GET /api/auth/me` | anyone | end session, current user or `null` |
| `POST /api/auth/preferences` | signed in | `{dailyEmail: true|false}` |
| `GET/POST /api/unsubscribe?token=` | e-mail link | confirmation page / one-click unsubscribe |
| `GET /api/stats` | anyone | `{users}`, verified readers (administrator not counted) |
| `GET /api/thoughts/today` | anyone | newest active thought `{title, message}` or `null` |
| `GET/POST /api/admin/thoughts` | admin | list all, publish `{title?, message}` (message 1-600 characters) |
| `DELETE /api/admin/thoughts/<id>` | admin | remove from the site and the e-mail |
| `POST /api/admin/test-email` | admin | send today's daily e-mail to the administrator only |

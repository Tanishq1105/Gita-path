# Gita Path: A Multilingual Bhagavad Gita Reading and Audio Platform

## Abstract

Gita Path is a standalone web application that makes the complete imported Bhagavad Gita edition accessible through reading, listening, search and personal study tools. It presents 18 chapters and 701 verse records in Sanskrit, with transliteration, word meanings, five English translations, two Hindi translations and recorded Sanskrit recitation files. A React and JavaScript frontend provides a configurable reader and persistent audio controls. A Flask backend serves structured content, multilingual search and seekable audio through a read-only REST API. Personal bookmarks, notes and reading progress remain in browser storage, with validated backup and restore for portability. A reproducible import pipeline validates verse numbering, translation joins and recordings. The distribution includes application source and a built frontend, allowing normal operation with Python alone after dependency installation. The project focuses on reliable access to source material, clear attribution, comfortable reading, and verifiable behaviour without relying on a content-generation service.

## 1. Problem statement

Readers often need to move between separate resources for Sanskrit text, meanings, translations and audio. A useful study application must keep those resources aligned by chapter and verse, expose differences between translations, and preserve the reader's place and reflections. Reliance on a remote content API can also make a basic reading task unavailable when a provider is down. The project addresses these needs with bundled, structured content and a backend that serves it directly.

## 2. Objectives

1. Provide the full imported edition with faithful chapter/verse numbering.
2. Present Sanskrit, Roman transliteration, word meanings and attributed translations.
3. Support recorded verse playback with continuous listening and seeking.
4. Search the corpus across its scripts and all supplied translations.
5. Provide bookmarks, notes and progress without requiring an account.
6. Make personal data portable through validated, confirmed backup restoration.
7. Package the project for local operation, source-level development and deployment.

## 3. Requirements and scope

Functional requirements include chapter browsing, a deep-linked reader, single-verse and chapter modes, translator selection, commentary loading, audio controls, language/chapter search filters, personal library management, reading preferences and error handling.

Non-functional requirements include a small runtime dependency set, bounded data loading, readable Unicode text, no generated scripture, a clear privacy model, repeatable content import, maintainable modules and automated verification. The server must not accept personal notes, reveal source directories or require a provider key for reading.

Accounts and cloud synchronisation are outside this version's scope. Hindi and English narration is not included in the provided recordings. The project does not claim a new scripture translation, scholarly interpretation or machine-learning method.

## 4. System design

The client is a React single-page application built with Vite and JavaScript. React Router handles navigation. The app uses relative REST requests and stores only personal study state locally. The backend uses Flask's application-factory pattern, a separate Catalog class for content access and search, and Waitress for HTTP serving.

In development, the launcher starts the Python server before Vite and configures the proxy target. In normal operation, Flask serves the built frontend and API from one origin. The same normal mode works without a Node.js runtime because the compiled frontend is included in the distribution. A multistage container recipe can rebuild the client before packaging the Python server.

Chapter data is fetched as needed. Commentary uses a separate endpoint and is loaded only when requested. Bounded Python caches avoid repeatedly parsing frequently used files without loading the entire commentary collection. Audio is served from file paths using conditional responses, allowing browser byte-range seeking.

The architecture diagram and endpoint reference are in README.md and docs/API.md.

## 5. Dataset preparation

The source is the provided gita-main repository. Its original data contains 18 chapter records, 701 verse records, 4,907 translation rows and 701 MP3 files. This edition contains 35 verses in Chapter 13. Those identifiers and counts are preserved throughout the API and client rather than silently forcing a 700-row convention.

The import pipeline reads the original chapter, verse, translation and commentary files. It joins translations by the global verse ID, checks that every verse has all seven translation entries, and validates exact chapter sizes. It normalises display whitespace and leading translation-reference markers without rewriting scripture. Alternate translation archives are excluded. All original audio bytes are copied and recorded by SHA256 in an import manifest.

Generated output includes chapter JSON, author metadata, a multilingual search index, per-chapter/per-author commentary files, audio folders and client-side edition constants. Audio files 5.27 and 5.28 are byte-identical in the supplied source; the project preserves this source characteristic without asserting whether it is intentional combined recitation.

## 6. Implemented modules

### Reader

The reader supports direct URLs, chapter and verse selection, previous/next navigation across chapter boundaries, a full-chapter default, optional single-verse presentation, translation modes and author selection. The full-chapter mode tracks the visible verse so toolbar actions and resume data follow the reader's position. Text size, line spacing, source display toggles and three themes are configurable. Focus mode provides a less cluttered layout, with native fullscreen where supported.

### Audio

A shared audio provider persists while routes change. Playback state follows actual media events rather than assuming a play request succeeded. Controls support pause/resume, seeking, volume, four speeds, repeat, automatic advancement and stop/continue at chapter ends. A request epoch prevents a stale rejected play promise from overwriting the state of a newer track. Browser autoplay errors and missing recordings produce actionable messages.

### Search

The backend searches Sanskrit, transliteration and every supplied English/Hindi translation. Unicode normalisation removes Latin accents for matching while preserving Devanagari vowel signs. Reference queries are parsed separately. Results are de-duplicated by verse, filtered by language/chapter and paginated. Input lengths and numeric bounds are validated.

### Personal library

Versioned browser state contains preferences, bookmarks, notes, manual read marks, recent references and last-read position. Notes are displayed as text. A schema checks imported backups for valid references, translator membership, settings ranges, timestamps and a 2 MB UTF-8 size limit. A confirmation is required before replacing the current library. Storage failures retain the active session in memory and encourage downloading a backup.

## 7. Verification

Backend tests check complete corpus coverage, all 701 recording checksums, correct translation joins, missing-reference errors, multilingual search, pagination, ETags, audio byte ranges and production SPA routing. A separate live test starts Waitress and checks real loopback HTTP responses and seekable audio.

Frontend tests cover reference bounds, first/last and cross-chapter navigation, visible-verse selection, playback-ended decisions, daily-verse validity, persistent personal state, quota/corruption recovery and backup validation. Rendered React tests exercise chapter browsing, deep links, bookmarks, note editing, language/theme changes, player persistence across routes, result navigation, confirmed/cancelled restores and malformed-file rejection.

The final checker also runs JavaScript linting and the production build. TEST_RESULTS.json records actual outcomes. Component tests simulate the media element; they do not certify the sound or recitation accuracy. Source audio was retained rather than re-recorded or corrected. A real desktop/mobile visual browser check could not be completed in the execution environment. Docker and Windows desktop execution are not claimed as tested.

## 8. Privacy, attribution and limitations

Personal study data stays in the browser; the server exposes read-only routes. No authentication credential or AI key is required. The software includes source and font notices. Translations and recordings retain their owners' rights and should be redistributed according to the applicable source terms.

This version provides no central user database or automatic cross-device sync. Browser storage can be lost, so backup is essential. The included audio is Sanskrit-only, and the source does not name the reciter. The commentary interface presents Hindi and English commentaries only. Scholarship and translation quality remain properties of the supplied sources rather than claims established by application tests.

## 9. Future scope

Possible extensions include optional account-based synchronisation, verified Hindi/English narration, licensed additional translations, offline installation with a service worker, structured study plans, accessibility testing with screen readers, and human review of verse/audio alignment. Each extension should preserve the reader's ability to use the core corpus without an external generation provider.

## Conclusion

Gita Path integrates structured scripture, attributed meanings and recorded recitations into a standalone application with a defined API and maintainable client. Its main engineering contributions are faithful import validation, aligned content navigation, persistent listening, multilingual search and portable personal study state. The project is delivered as runnable software with source, data, tests and deployment documentation; its evaluation supports software behaviour and completeness, not theological or interpretive authority.

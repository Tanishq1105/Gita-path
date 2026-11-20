# Gita Path — standalone project

## The easiest way to run it

The ZIP includes the complete source code **and a built frontend**. For normal use you need only Python 3.10 or newer. No account, API key, database or Node.js installation is needed to run the included build.

1. Extract the ZIP completely into a fresh folder. This version has the top-level folder `gita-path-js-flask`; use it rather than copying files over an earlier download.
2. Open the extracted `gita-path-js-flask` folder.
3. Open a terminal in that folder and run:

```sh
python setup_project.py
python run.py
```

4. Open **http://127.0.0.1:5000** in your browser. Keep the terminal open. Press Ctrl+C to stop.

On Windows you can also double-click `start_windows.bat`. If Windows uses the Python launcher, use `py -3` instead of `python` in the commands above. Do not open `frontend/index.html` by double-clicking: the app needs its Flask server.

The first setup downloads Python dependencies. After setup, the text, fonts and audio are served from your computer; no external content API is used.

## Edit the React frontend

Install Node.js 24 (or Node.js 22.13+) with npm, then run:

```sh
python setup_project.py --dev
python run.py --dev
```

Open **http://127.0.0.1:3000** for live frontend updates. This command starts both Flask and Vite and stops them when you press Ctrl+C. Changes to Python code require restarting the command.

To rebuild the single-server version after editing:

```sh
cd frontend
npm run build
```

Return to the project root and run `python run.py` to serve the new build.

## What is included

- All 18 chapters and 701 verse records from the provided edition, with Sanskrit, transliteration and word meanings.
- Five English and two Hindi translations, with author names.
- All 701 original Sanskrit MP3 files and Hindi/English commentary.
- Reader, single-verse/chapter views, preferences, focus mode, audio player, search and personal library.
- Flask REST API, import pipeline, tests, source licences, README and academic project report.

Audio is Sanskrit-only; spoken Hindi/English meanings are not included. Personal notes and bookmarks stay in the current browser. Use My Library → Download backup before clearing browser data or switching devices.

## Troubleshooting

| Problem                                                | What to do                                                       |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| `python` is not recognised                             | Install Python, or try `py -3` on Windows.                       |
| Missing Flask or Waitress                              | Run `python setup_project.py` from the project root.             |
| Port 5000 is occupied                                  | Run `python run.py --port 5050` and open port 5050.              |
| The book server could not be reached in developer mode | Start with `python run.py --dev`; both services are required.    |
| Changes do not appear in normal mode                   | Rebuild with `npm run build` inside `frontend`, then restart.    |
| Audio will not start automatically                     | Press play once. Browsers require a user gesture to begin audio. |
| Bookmark is missing on another device                  | Download and restore a backup; there is no account sync.         |

For development verification, run `python check_project.py` after developer setup. See `README.md`, `docs/API.md` and `PROJECT_REPORT.md` for the full project description.

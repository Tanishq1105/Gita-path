"""HTTP API, conditional audio streaming, and production SPA hosting."""
from pathlib import Path
import json
import os
from flask import Flask, abort, jsonify, request, send_file, send_from_directory
from werkzeug.exceptions import HTTPException
from .catalog import Catalog
from . import accounts

ROOT = Path(__file__).resolve().parent.parent


def create_app(config=None):
    app = Flask(__name__, static_folder=None)
    app.config.from_mapping(DATA_DIR=ROOT / "backend/data", MEDIA_DIR=ROOT / "backend/media/audio",
                            FRONTEND_DIR=ROOT / "frontend/dist", MAX_CONTENT_LENGTH=2 * 1024 * 1024)
    if config:
        app.config.update(config)
    app.json.ensure_ascii = False
    try:
        catalog = Catalog(app.config["DATA_DIR"], app.config["MEDIA_DIR"])
    except FileNotFoundError as error:
        raise RuntimeError("Gita data is missing. Run python scripts/import_data.py --source PATH_TO_GITA_MAIN_ZIP") from error
    app.extensions["catalog"] = catalog
    accounts.setup(app)
    if os.environ.get("GITA_BEHIND_PROXY") == "1":  # hosting platforms terminate HTTPS in front of the app
        from werkzeug.middleware.proxy_fix import ProxyFix
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)

    def json_data(data):
        response = jsonify(data)
        response.add_etag()
        response.cache_control.public = True
        response.cache_control.max_age = 3600
        return response.make_conditional(request)

    def require_ref(chapter, verse=1):
        if not catalog.valid(chapter, verse):
            abort(404, description="That chapter or verse is not in this edition.")

    @app.get("/api/health")
    def health():
        return jsonify(status="ok", application="Gita Path", edition=catalog.meta["edition"], version="2.1.0")

    @app.get("/api/chapters")
    def chapters():
        return json_data(catalog.meta)

    @app.get("/api/chapters/<int:chapter>")
    def chapter_data(chapter):
        require_ref(chapter)
        return json_data({"chapter": catalog.meta["chapters"][chapter - 1], "verses": catalog.chapter(chapter)})

    @app.get("/api/verses/<int:chapter>/<int:verse>")
    def verse_data(chapter, verse):
        require_ref(chapter, verse)
        return json_data(catalog.chapter(chapter)[verse - 1])

    @app.get("/api/commentary/<int:chapter>/<int:author>")
    def commentary(chapter, author):
        require_ref(chapter)
        if author not in {a["id"] for a in catalog.meta["commentators"]}:
            abort(404, description="Unknown commentary author.")
        try:
            return json_data(catalog.commentary(chapter, author))
        except FileNotFoundError:
            abort(404, description="No commentary from this author in this chapter.")

    def send_audio(path):
        if not path.is_file():
            abort(404, description="This recording is unavailable.")
        return send_file(path, mimetype="audio/mpeg", conditional=True, etag=True, max_age=86400)

    @app.get("/api/audio/<int:chapter>/<int:verse>.mp3")
    def audio(chapter, verse):
        """Original slow chant (kept for existing links and bookmarks)."""
        require_ref(chapter, verse)
        return send_audio(catalog.media_dir / str(chapter) / f"{verse}.mp3")

    @app.get("/api/audio/<track>/<int:chapter>/<int:verse>.mp3")
    def audio_track(track, chapter, verse):
        """Per-language recordings: sa (Sanskrit), hi (Hindi), en (English) or chant."""
        if track not in {"sa", "hi", "en", "chant"}:
            abort(404, description="Unknown audio track.")
        require_ref(chapter, verse)
        folder = catalog.media_dir / str(chapter) if track == "chant" else catalog.media_dir / track / str(chapter)
        return send_audio(folder / f"{verse}.mp3")

    @app.get("/api/search")
    def search():
        query = request.args.get("q", "").strip()
        language = request.args.get("lang", "all")
        if len(query) > 200:
            abort(400, description="Search is limited to 200 characters.")
        if language not in {"all", "sanskrit", "transliteration", "english", "hindi"}:
            abort(400, description="Unsupported search language.")
        try:
            chapter = int(request.args["chapter"]) if request.args.get("chapter") else None
            offset = int(request.args.get("offset", "0"))
            limit = int(request.args.get("limit", "20"))
        except ValueError:
            abort(400, description="Chapter, offset and limit must be integers.")
        if (chapter is not None and chapter not in catalog.counts) or not 0 <= offset <= 701 or not 1 <= limit <= 50:
            abort(400, description="Invalid chapter or pagination range.")
        return json_data(catalog.search(query, language, chapter, offset, limit))

    @app.get("/")
    @app.get("/<path:path>")
    def frontend(path=""):
        dist = Path(app.config["FRONTEND_DIR"])
        if path == "api" or path.startswith("api/") or any(p.startswith(".") for p in Path(path).parts):
            abort(404, description="Route not found.")
        if path and (dist / path).is_file():
            return send_from_directory(dist, path)
        if Path(path).suffix:
            abort(404, description="Asset not found.")
        if not (dist / "index.html").is_file():
            return jsonify(message="API is ready. Run npm run dev in frontend, or build the frontend for single-server mode."), 503
        response = send_from_directory(dist, "index.html")
        response.cache_control.no_cache = True
        return response

    @app.errorhandler(HTTPException)
    def http_error(error):
        response = error.get_response()
        response.set_data(json.dumps({"error": {"code": error.code, "message": error.description}}, ensure_ascii=False))
        response.mimetype = "application/json"
        return response

    @app.after_request
    def headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["Content-Security-Policy"] = "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; media-src 'self'; connect-src 'self'; script-src 'self'; base-uri 'self'; frame-ancestors 'self'"
        if request.path == "/api/health" or request.path.startswith(("/api/auth", "/api/admin", "/api/stats", "/api/announcements")):
            response.headers["Cache-Control"] = "no-store"
        return response

    return app

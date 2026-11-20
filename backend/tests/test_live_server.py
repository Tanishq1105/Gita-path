"""Exercise Waitress over real loopback HTTP, not just Flask's test client."""
import json
import threading
import urllib.request
from waitress import create_server
from backend import create_app


def test_waitress_http_and_audio_range():
    app = create_app()
    server = create_server(app, host="127.0.0.1", port=0, threads=2)
    worker = threading.Thread(target=server.run, daemon=True)
    worker.start()
    base = f"http://127.0.0.1:{server.effective_port}"
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(base + "/api/health", timeout=5) as response:
            assert json.load(response)["status"] == "ok"
        request = urllib.request.Request(base + "/api/audio/2/47.mp3", headers={"Range":"bytes=0-31"})
        with opener.open(request, timeout=5) as response:
            assert response.status == 206 and len(response.read()) == 32
        with opener.open(base + "/api/search?q=13.35&lang=english", timeout=5) as response:
            assert json.load(response)["total"] == 1
    finally:
        server.close()
        server.task_dispatcher.shutdown(timeout=2)

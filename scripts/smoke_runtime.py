"""Check the packaged single-server app with Node/npm removed from PATH."""
from pathlib import Path
import json
import os
import re
import signal
import socket
import subprocess
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def main():
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    options = {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == "nt" else {"start_new_session": True}
    child = subprocess.Popen([sys.executable, str(ROOT / "run.py"), "--port", str(port)], cwd=ROOT,
                             env={**os.environ, "PATH":""}, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, **options)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    base = f"http://127.0.0.1:{port}"
    try:
        ready = False
        for _ in range(60):
            try:
                with opener.open(base + "/api/health", timeout=.5) as response:
                    ready = json.load(response)["status"] == "ok"
                if ready:
                    break
            except OSError:
                if child.poll() is not None:
                    raise RuntimeError(child.stdout.read().decode(errors="replace"))
                time.sleep(.15)
        assert ready, "Packaged server did not start"
        for path in ["/", "/read/2/47", "/library", "/favicon.svg"]:
            with opener.open(base + path, timeout=5) as response:
                assert response.status == 200
                content = response.read().decode()
                if path == "/":
                    assets = re.findall(r'(?:src|href)="(/assets/[^\"]+)"', content)
                    assert assets, "Built frontend assets were not linked"
                    for asset in assets:
                        with opener.open(base + asset, timeout=5) as resource:
                            assert resource.status == 200 and len(resource.read()) > 100
        with opener.open(base + "/api/verses/13/35", timeout=5) as response:
            assert json.load(response)["verse"] == 35
        request = urllib.request.Request(base + "/api/audio/2/47.mp3", headers={"Range":"bytes=0-63"})
        with opener.open(request, timeout=5) as response:
            assert response.status == 206 and len(response.read()) == 64
        print("Packaged runtime passed: SPA routes, built assets, verse API and audio seeking; Node/npm absent from PATH.")
    finally:
        if child.poll() is None:
            try:
                if os.name == "nt":
                    child.send_signal(signal.CTRL_BREAK_EVENT)
                else:
                    os.killpg(child.pid, signal.SIGTERM)
                child.wait(timeout=5)
            except (OSError, subprocess.TimeoutExpired):
                child.kill()
        if child.stdout:
            child.stdout.close()


if __name__ == "__main__":
    main()

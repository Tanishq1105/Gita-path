"""One-command local server. Use --dev for React live reload."""
import argparse
import os
import signal
import subprocess
import sys
import time
import urllib.request
from project_tools import ROOT, npm_command, use_project_python


def main():
    use_project_python()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dev", action="store_true")
    parser.add_argument("--host", default=os.environ.get("GITA_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "5000")))
    parser.add_argument("--frontend-port", type=int, default=3000)
    args = parser.parse_args()
    try:
        from backend import create_app
        from waitress import serve
    except ImportError:
        raise SystemExit("Install the project first: python setup_project.py")
    if not args.dev:
        if not (ROOT / "frontend/dist/index.html").is_file():
            raise SystemExit("Frontend build is missing. Run python setup_project.py --dev")
        print(f"\nGita Path is ready at http://127.0.0.1:{args.port}\nPress Ctrl+C to stop.\n", flush=True)
        serve(create_app(), host=args.host, port=args.port, threads=4)
        return
    if not (ROOT / "frontend/node_modules/vite").is_dir():
        raise SystemExit("Developer setup is required: python setup_project.py --dev")
    children = []
    options = {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == "nt" else {"start_new_session": True}
    try:
        children.append(subprocess.Popen([sys.executable, "-m", "backend.server", "--port", str(args.port)], cwd=ROOT, **options))
        ready = False
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        for _ in range(40):
            if children[0].poll() is not None:
                raise RuntimeError("The backend stopped. Check the message above and make sure its port is free.")
            try:
                with opener.open(f"http://127.0.0.1:{args.port}/api/health", timeout=.5) as response:
                    ready = response.status == 200
                if ready:
                    break
            except OSError:
                time.sleep(.2)
        if not ready:
            raise RuntimeError("Backend startup timed out.")
        env = {**os.environ, "GITA_API_TARGET": f"http://127.0.0.1:{args.port}"}
        children.append(subprocess.Popen(npm_command("run", "dev", "--", "--port", str(args.frontend_port)), cwd=ROOT / "frontend", env=env, **options))
        print(f"\nDevelopment reader: http://127.0.0.1:{args.frontend_port}\n", flush=True)
        while all(child.poll() is None for child in children):
            time.sleep(.5)
    finally:
        for child in reversed(children):
            if child.poll() is None:
                try:
                    if os.name == "nt":
                        child.send_signal(signal.CTRL_BREAK_EVENT)
                    else:
                        os.killpg(child.pid, signal.SIGTERM)
                    child.wait(timeout=5)
                except (ProcessLookupError, subprocess.TimeoutExpired, OSError):
                    child.kill()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nGita Path stopped.")
    except (RuntimeError, OSError) as error:
        raise SystemExit(f"Cannot start Gita Path: {error}")

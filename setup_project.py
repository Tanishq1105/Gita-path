"""Install runtime dependencies; --dev also installs and builds the frontend."""
import argparse
import subprocess
import sys
import venv
from project_tools import ROOT, VENV_PYTHON, npm_command


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dev", action="store_true", help="Install frontend build tools and backend test dependencies")
    args = parser.parse_args()
    if sys.version_info < (3, 10):
        raise SystemExit("Python 3.10 or newer is required.")
    if not VENV_PYTHON.exists():
        print("Creating the project virtual environment...", flush=True)
        venv.EnvBuilder(with_pip=True).create(ROOT / ".venv")
    runtime = ROOT / "backend" / ("requirements-dev.txt" if args.dev else "requirements-lock.txt")
    subprocess.run([str(VENV_PYTHON), "-m", "pip", "install", "-r", str(runtime)], check=True)
    if args.dev:
        subprocess.run(npm_command("ci"), cwd=ROOT / "frontend", check=True)
        subprocess.run(npm_command("run", "build"), cwd=ROOT / "frontend", check=True)
    elif not (ROOT / "frontend/dist/index.html").is_file():
        raise SystemExit("The built frontend is missing. Run python setup_project.py --dev to rebuild it.")
    print("\nSetup complete. Start the website with: python run.py", flush=True)


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError) as error:
        raise SystemExit(f"Setup stopped: {error}")

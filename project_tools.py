"""Small cross-platform helpers shared by setup and the development launcher."""
from pathlib import Path
import os
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
VENV_PYTHON = ROOT / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def npm_command(*args):
    node, npm = shutil.which("node"), shutil.which("npm")
    if not node or not npm:
        raise RuntimeError("Install Node.js 22.13+ (or 24) with npm to edit/build the frontend. The supplied built frontend does not require Node.js.")
    version = subprocess.check_output([node, "--version"], text=True).strip().lstrip("v")
    parts = tuple(int(p) for p in version.split(".")[:2])
    if not ((parts[0] == 22 and parts[1] >= 13) or parts[0] >= 24):
        raise RuntimeError("Frontend development requires Node.js 22.13 (22.x) or 24+.")
    candidates = [Path(node).parent / "node_modules/npm/bin/npm-cli.js", Path(npm).resolve()]
    for candidate in candidates:
        if candidate.is_file() and candidate.suffix in {".js", ".mjs", ".cjs"}:
            return [node, str(candidate), *args]
    if os.name == "nt":
        return [os.environ.get("COMSPEC", "cmd.exe"), "/d", "/c", npm, *args]
    return [npm, *args]


def use_project_python():
    if VENV_PYTHON.is_file() and Path(sys.prefix).absolute() != (ROOT / ".venv").absolute():
        raise SystemExit(subprocess.call([str(VENV_PYTHON), *sys.argv]))

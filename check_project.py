"""Run the project's existing tests and build, recording the actual outcomes."""
import json
import re
import subprocess
import sys
from project_tools import ROOT, npm_command, use_project_python


def main():
    use_project_python()
    checks = [("backend", [sys.executable, "-m", "pytest"], ROOT),
              ("javascript_lint", npm_command("run", "lint"), ROOT / "frontend"),
              ("frontend", npm_command("test"), ROOT / "frontend"),
              ("production_build", npm_command("run", "build"), ROOT / "frontend"),
              ("packaged_python_only_runtime", [sys.executable, "scripts/smoke_runtime.py"], ROOT)]
    results = {}
    for name, command, cwd in checks:
        print(f"Running {name}...", flush=True)
        outcome = subprocess.run(command, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        output = re.sub(r"\x1b\[[0-9;]*m", "", outcome.stdout)
        record = {"passed": outcome.returncode == 0}
        pattern = r"(\d+) passed" if name == "backend" else r"Tests\s+(\d+) passed"
        match = re.search(pattern, output)
        if match:
            record["tests"] = int(match[1])
        results[name] = record
        print(output[-1800:], flush=True)
        (ROOT / "TEST_RESULTS.json").write_text(json.dumps(results, indent=2) + "\n")
        if outcome.returncode:
            raise SystemExit(outcome.returncode)
    print("All checks passed. See TEST_RESULTS.json.")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError) as error:
        raise SystemExit(f"Check setup failed: {error}. Run python setup_project.py --dev first.")

"""Guard the requested plain-JavaScript + Flask project structure."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[2]


def test_frontend_is_plain_javascript_and_backend_is_flask():
    frontend = ROOT / "frontend"
    assert (frontend / "src/main.jsx").is_file()
    assert (frontend / "vite.config.js").is_file()
    assert (frontend / "vitest.config.js").is_file()
    assert not (frontend / "tsconfig.json").exists()
    assert not list((frontend / "src").rglob("*.ts"))
    assert not list((frontend / "src").rglob("*.tsx"))
    package = json.loads((frontend / "package.json").read_text())
    dependencies = {**package["dependencies"], **package["devDependencies"]}
    assert "typescript" not in dependencies
    assert not any(name.startswith("@types/") for name in dependencies)
    assert not any(any(token in name.lower() for token in ["lovable", "tanstack", "supabase"]) for name in dependencies)
    assert package["scripts"]["build"] == "vite build"
    assert "typecheck" not in package["scripts"]
    assert (ROOT / "backend/app.py").is_file()
    assert "Flask==" in (ROOT / "backend/requirements.txt").read_text()

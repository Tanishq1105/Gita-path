from pathlib import Path
import hashlib
import json
import pytest
from backend import create_app
from backend.catalog import normalize

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def app():
    return create_app({"TESTING": True})


@pytest.fixture
def client(app):
    return app.test_client()


def test_health_and_edition(client):
    result = client.get("/api/health")
    assert result.status_code == 200
    assert result.json["edition"]["verses"] == 701
    assert result.headers["Cache-Control"] == "no-store"
    meta = client.get("/api/chapters").json
    assert len(meta["chapters"]) == 18
    assert meta["chapters"][12]["versesCount"] == 35
    assert [len(meta["translators"][k]) for k in ["english", "hindi"]] == [5, 2]


def test_full_content_integrity(app):
    catalog = app.extensions["catalog"]
    manifest = catalog.read_json("import_manifest.json")
    seen = set()
    for c, count in catalog.counts.items():
        rows = catalog.chapter(c)
        assert len(rows) == count
        for row in rows:
            key = f"{c}.{row['verse']}"
            assert key not in seen
            seen.add(key)
            assert row["text"].strip()
            assert len(row["translations"]) == 7 and all(row["translations"].values())
            audio = catalog.media_dir / str(c) / f"{row['verse']}.mp3"
            assert hashlib.sha256(audio.read_bytes()).hexdigest() == manifest["audioSHA256"][key]
    assert len(seen) == 701


def test_correct_translation_join(client):
    row = client.get("/api/verses/2/47").json
    assert "कर्मण्येवाधिकारस्ते" in row["text"]
    assert "action" in row["translations"]["16"].lower()
    assert row["chapter"] == 2 and row["verse"] == 47


@pytest.mark.parametrize("path", ["/api/chapters/0", "/api/chapters/19", "/api/verses/13/36", "/api/verses/2/0", "/api/audio/19/1.mp3", "/api/audio/2/999.mp3", "/api/commentary/1/999", "/api/missing"])
def test_unknown_content_is_json_404(client, path):
    response = client.get(path)
    assert response.status_code == 404
    assert response.is_json and response.json["error"]["code"] == 404


@pytest.mark.parametrize("query", ["2.47", "2:47", "BG 2/47"])
def test_reference_search(client, query):
    data = client.get("/api/search", query_string={"q": query}).json
    assert data["total"] == 1
    assert (data["results"][0]["chapter"], data["results"][0]["verse"]) == (2,47)


def test_multilingual_search_and_filters(client):
    roman = client.get("/api/search", query_string={"q":"KARMANYEVADHIKARASTE", "lang":"transliteration"}).json
    assert any((r["chapter"],r["verse"]) == (2,47) for r in roman["results"])
    sanskrit = client.get("/api/search", query_string={"q":"धर्मक्षेत्रे", "lang":"sanskrit"}).json
    assert sanskrit["results"][0]["chapter"] == 1
    filtered = client.get("/api/search", query_string={"q":"Arjuna", "chapter":"3", "lang":"english", "limit":"2"}).json
    assert filtered["total"] > 2 and len(filtered["results"]) == 2
    assert all(r["chapter"] == 3 and r["field"] == "english" for r in filtered["results"])
    assert client.get("/api/search?q=13.35").json["total"] == 1
    assert client.get("/api/search?q=13.36").json["total"] == 0


@pytest.mark.parametrize("query", [{"q":"x"*201},{"lang":"invalid"},{"chapter":"19"},{"limit":"51"},{"offset":"-1"},{"limit":"abc"}])
def test_invalid_search_inputs(client, query):
    response = client.get("/api/search", query_string=query)
    assert response.status_code == 400 and response.is_json


def test_empty_search_and_pagination(client):
    assert client.get("/api/search?q=").json["total"] == 0
    first = client.get("/api/search?q=2&limit=5&offset=0").json
    second = client.get("/api/search?q=2&limit=5&offset=5").json
    assert first["total"] == 72
    assert first["results"][0]["verse"] == 1
    assert second["results"][0]["verse"] == 6


def test_audio_range_and_head(client):
    response = client.get("/api/audio/2/47.mp3", headers={"Range":"bytes=0-63"})
    assert response.status_code == 206 and len(response.data) == 64
    assert response.headers["Content-Type"].startswith("audio/mpeg")
    assert response.headers["Content-Range"].startswith("bytes 0-63/")
    response.close()
    head = client.head("/api/audio/2/47.mp3")
    assert head.status_code == 200 and not head.data
    assert int(head.headers["Content-Length"]) > 1000
    head.close()
    invalid = client.get("/api/audio/2/47.mp3", headers={"Range":"bytes=99999999-"})
    assert invalid.status_code == 416
    assert invalid.headers["Content-Range"].startswith("bytes */")


def test_conditional_cache(client):
    original = client.get("/api/chapters/1")
    cached = client.get("/api/chapters/1", headers={"If-None-Match":original.headers["ETag"]})
    assert cached.status_code == 304 and not cached.data


def test_commentary(client):
    response = client.get("/api/commentary/2/16")
    assert response.status_code == 200 and response.json.get("47")


def test_security_and_spa_fallback(tmp_path):
    (tmp_path / "index.html").write_text("<html>Gita Path</html>")
    app = create_app({"TESTING":True, "FRONTEND_DIR":tmp_path})
    client = app.test_client()
    assert client.get("/read/2/47").status_code == 200
    assert client.get("/library").status_code == 200
    assert client.get("/assets/missing.js").status_code == 404
    assert client.get("/.env").status_code == 404
    assert client.get("/api/not-found").is_json
    assert client.get("/api/chapters").headers["X-Content-Type-Options"] == "nosniff"


def test_normalization_preserves_devanagari():
    assert normalize("Dharma-Kṣhetre") == "dharma kshetre"
    assert normalize("धर्मक्षेत्रे") == "धर्मक्षेत्रे"


def test_all_language_tracks_exist_and_match_manifest(client):
    catalog = client.application.extensions["catalog"]
    manifest = json.loads((catalog.data_dir / "import_manifest.json").read_text(encoding="utf-8"))
    for track in ("sa", "hi", "en"):
        for chapter, count in catalog.counts.items():
            for verse in range(1, count + 1):
                path = catalog.media_dir / track / str(chapter) / f"{verse}.mp3"
                assert hashlib.sha256(path.read_bytes()).hexdigest() == manifest["audioSHA256Tracks"][track][f"{chapter}.{verse}"]


@pytest.mark.parametrize("track", ["sa", "hi", "en", "chant"])
def test_track_endpoint_streams_ranges(client, track):
    response = client.get(f"/api/audio/{track}/2/47.mp3", headers={"Range": "bytes=0-63"})
    assert response.status_code == 206
    assert response.headers["Content-Type"].startswith("audio/mpeg")


def test_unknown_track_and_corrected_text(client):
    assert client.get("/api/audio/fr/2/47.mp3").status_code == 404
    assert client.get("/api/audio/sa/19/1.mp3").status_code == 404
    assert "श्रृ" not in client.get("/api/verses/10/1").get_data(as_text=True)
    assert [t["id"] for t in client.get("/api/chapters").get_json()["audioTracks"]] == ["sa", "hi", "en", "chant"]

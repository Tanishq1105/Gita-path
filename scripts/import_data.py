"""Reproducible content import, directly from the user's gita-main ZIP or folder."""
from pathlib import Path
from collections import defaultdict
import argparse
import hashlib
import json
import re
import shutil
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
COUNTS = [47,72,43,42,29,47,30,28,34,42,55,20,35,27,20,24,28,78]


def clean(value):
    return re.sub(r"\n{3,}", "\n\n", str(value or "").replace("\r\n", "\n").replace("\\n", "\n").replace("\u00a0", " ")).strip()


def run(source, destination=ROOT):
    source, destination = Path(source), Path(destination)
    archive = zipfile.ZipFile(source) if source.is_file() else None
    if archive:
        candidates = [n[:-len("data/chapters.json")] for n in archive.namelist() if n.endswith("data/chapters.json")]
        if len(candidates) != 1:
            raise ValueError("Expected one gita-main/data/chapters.json in the archive")
        prefix = candidates[0]
        read = lambda name: archive.read(prefix + name)
    else:
        read = lambda name: (source / name).read_bytes()
    load = lambda name: json.loads(read("data/" + name + ".json"))
    chapters, verses, translations, comments = (load(n) for n in ["chapters", "verse", "translation", "commentary"])
    pairs = {(v["chapter_number"], v["verse_number"]) for v in verses}
    ids = {v["id"]: v for v in verses}
    assert len(chapters) == 18 and len(ids) == len(pairs) == len(verses) == 701, "Invalid chapter / verse coverage"
    assert [sum(v["chapter_number"] == c for v in verses) for c in range(1,19)] == COUNTS
    tr, people = defaultdict(dict), {"english": {}, "hindi": {}}
    for row in translations:
        assert row["verse_id"] in ids, "Dangling translation"
        lang = row["lang"]
        if lang not in people:
            continue
        people[lang][row["author_id"]] = row["authorName"]
        assert row["author_id"] not in tr[row["verse_id"]], "Duplicate verse/translator row"
        tr[row["verse_id"]][str(row["author_id"])] = re.sub(r"^।।\d+\.\d+।।\s*", "", clean(row["description"]))
    translators = {lang: [{"id": i, "name": name} for i, name in sorted(authors.items())] for lang, authors in people.items()}
    assert len(translators["english"]) == 5 and len(translators["hindi"]) == 2
    expected_authors = {str(a["id"]) for group in translators.values() for a in group}
    assert all(set(tr[v["id"]]) == expected_authors and all(tr[v["id"]].values()) and clean(v["text"]) for v in verses)
    data = destination / "backend/data"
    audio = destination / "backend/media/audio"
    data.mkdir(parents=True, exist_ok=True)
    audio.mkdir(parents=True, exist_ok=True)
    def write(path, value):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    commentators = {r["author_id"]: {"id": r["author_id"], "name": r["authorName"], "lang": r["lang"]} for r in comments if r["lang"] in people}
    meta = {"edition": {"chapters": 18, "verses": 701, "chapterCounts": COUNTS, "audioLanguage": "Sanskrit"}, "translators": translators, "commentators": list(commentators.values()), "chapters": [
        {"number": c["chapter_number"], "name": clean(c["name"]), "title": clean(c["name_translation"]), "transliterated": clean(c["name_transliterated"]), "meaning": clean(c["name_meaning"]), "versesCount": c["verses_count"], "summary": {"en": clean(c["chapter_summary"]), "hi": clean(c["chapter_summary_hindi"])}} for c in sorted(chapters, key=lambda c:c["chapter_number"])]}
    write(data / "meta.json", meta)
    search, audio_hashes = [], {}
    groups = defaultdict(lambda: defaultdict(dict))
    for row in comments:
        if row["lang"] in people and row["verse_id"] in ids:
            v = ids[row["verse_id"]]
            groups[v["chapter_number"]][row["author_id"]][str(v["verse_number"])] = clean(row["description"])
    for chapter in range(1,19):
        rows = []
        for v in sorted((v for v in verses if v["chapter_number"] == chapter), key=lambda v:v["verse_number"]):
            number = v["verse_number"]
            rows.append({"id": v["id"], "chapter": chapter, "verse": number, "text": clean(v["text"]), "transliteration": clean(v["transliteration"]), "wordMeanings": clean(v["word_meanings"]), "translations": tr[v["id"]]})
            blob = read(f"data/verse_recitation/{chapter}/{number}.mp3")
            assert len(blob) > 1000, "Empty recording"
            path = audio / str(chapter) / f"{number}.mp3"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(blob)
            audio_hashes[f"{chapter}.{number}"] = hashlib.sha256(blob).hexdigest()
            search.append({"chapter": chapter, "verse": number, "sanskrit": rows[-1]["text"], "transliteration": rows[-1]["transliteration"], "translations": [{"lang": lang, "author_id": a["id"], "text": tr[v["id"]][str(a["id"]) ]} for lang, authors in translators.items() for a in authors]})
        write(data / "chapters" / f"{chapter}.json", rows)
        for author, text in groups[chapter].items():
            write(data / "commentary" / str(chapter) / f"{author}.json", text)
    write(data / "search.json", search)
    write(data / "import_manifest.json", {"edition": meta["edition"], "sourceArchiveSHA256": hashlib.sha256(source.read_bytes()).hexdigest() if archive else None, "translationRows": len(translations), "audioSHA256": audio_hashes, "source": "gita-main/data; archive/ translations excluded"})
    (data / "SOURCE_LICENSE.txt").write_bytes(read("LICENSE"))
    generated = destination / "frontend/src/generated/edition.js"
    generated.parent.mkdir(parents=True, exist_ok=True)
    generated.write_text("// Generated by scripts/import_data.py; do not edit by hand.\nexport const COUNTS = " + json.dumps(COUNTS) + ";\nexport const EN_AUTHORS = " + json.dumps(sorted(people['english'])) + ";\nexport const HI_AUTHORS = " + json.dumps(sorted(people['hindi'])) + ";\n", encoding="utf-8")
    if archive:
        archive.close()
    print("Validated and imported 18 chapters, 701 verses, seven translations per verse and 701 recordings.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True)
    args = parser.parse_args()
    run(args.source)

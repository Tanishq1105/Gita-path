"""Merge the supplementary ``gita.zip`` (text + Sanskrit/Hindi/English audio) into the project.

What it does
------------
1. text   - corrects Sanskrit spelling/encoding errors using the zip's text, keeps the
            zip's original Shri Purohit Swami wording (the one the English narration
            follows) and rebuilds the search index.
2. audio  - converts the zip's OGG files to loudness-matched mono MP3 so every browser
            (including Safari/iOS) can play them:
                backend/media/audio/sa/<chapter>/<verse>.mp3   Sanskrit recitation
                backend/media/audio/hi/<chapter>/<verse>.mp3   Hindi narration
                backend/media/audio/en/<chapter>/<verse>.mp3   English narration
            The original slow-chant MP3s stay where they were
            (backend/media/audio/<chapter>/<verse>.mp3) and are served as the "chant" track.
3. meta   - writes audio track info + default translators into meta.json and the manifest.

Usage:  python scripts/import_gita_zip.py --source gita.zip [--steps text,audio,meta] [--budget 240]
Audio conversion is resumable: files already converted are skipped, and ``--budget``
stops cleanly after N seconds so it can be re-run in slices.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re
import subprocess
import tempfile
import time
import unicodedata
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "backend/data"
MEDIA = ROOT / "backend/media/audio"
COUNTS = [47, 72, 43, 42, 29, 47, 30, 28, 34, 42, 55, 20, 35, 27, 20, 24, 28, 78]
PUROHIT = ("21", "shri purohit swami")

# Zip text is taken as the reference for Sanskrit, with these two known glitches patched.
SANSKRIT_PATCH = {
    (2, 22): lambda t: t.replace("जीर्णा-\n\nन्यन्यानि", "जीर्णा\n\nन्यन्यानि"),  # stray hyphen from the source
    (17, 25): lambda t: t.replace("मोक्षकाङ्क्षिभि:", "मोक्षकाङ्क्षिभिः"),  # ASCII colon -> visarga
}

# Corruptions present in BOTH the original data and the zip (13 verses, e.g. 2.29, 10.1, 13.4).
GLOBAL_FIXES = [
    ("श्रृणवन्", "शृण्वन्"),  # 5.8
    ("श्रृ", "शृ"),  # श्रृणु -> शृणु, श्रृणोति -> शृणोति, श्रृण्वतो -> शृण्वतो
]

# (folder, filename suffix in the zip, ffmpeg sample rate, bitrate)
TRACKS = {
    "sa": ("mool_sloka", 22050, "40k"),
    "hi": ("hindi_translation", 32000, "48k"),
    "en": ("english_translations", 32000, "48k"),
}


def norm(value):
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", value)).strip()


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def read_zip_text(archive):
    out = {}
    for chapter in range(1, 19):
        raw = json.loads(archive.read(f"gita/text/bhagavad_gita_chapter_{chapter}.json"))
        for row in raw["BhagavadGitaChapter"]:
            out[(row["chapter"], row["verse"])] = row
    assert len(out) == 701
    return out


def clean_sanskrit(text):
    text = text.replace("\r\n", "\n").replace("\u00a0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def step_text(archive):
    zip_rows = read_zip_text(archive)
    search = []
    fixed = []
    for chapter in range(1, 19):
        path = DATA / "chapters" / f"{chapter}.json"
        rows = json.loads(path.read_text(encoding="utf-8"))
        for row in rows:
            key = (row["chapter"], row["verse"])
            new = clean_sanskrit(zip_rows[key]["text"])
            if key in SANSKRIT_PATCH:
                new = SANSKRIT_PATCH[key](new)
            for bad, good in GLOBAL_FIXES:
                new = new.replace(bad, good)
            strip = lambda s: re.sub(r"।।\s*[\d.]+\s*।।", "", norm(s))
            if strip(new) != strip(row["text"]):
                fixed.append(key)
                row["text"] = new
            english = zip_rows[key]["translations"][PUROHIT[1]]
            row["translations"][PUROHIT[0]] = norm(re.sub(r"^\s*\d+\.\d+\.?\s*", "", english))
        write_json(path, rows)
    # Rebuild the search index from the corrected chapter files.
    meta = json.loads((DATA / "meta.json").read_text(encoding="utf-8"))
    people = [("english", a["id"]) for a in meta["translators"]["english"]] + [("hindi", a["id"]) for a in meta["translators"]["hindi"]]
    for chapter in range(1, 19):
        for row in json.loads((DATA / "chapters" / f"{chapter}.json").read_text(encoding="utf-8")):
            search.append({"chapter": chapter, "verse": row["verse"], "sanskrit": row["text"], "transliteration": row["transliteration"],
                           "translations": [{"lang": lang, "author_id": a, "text": row["translations"][str(a)]} for lang, a in people]})
    write_json(DATA / "search.json", search)
    print(f"text: corrected Sanskrit in {len(fixed)} verses {fixed}; Purohit Swami wording replaced in 701; search index rebuilt")


def convert(blob_path, target, rate, bitrate):
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(".tmp.mp3")
    probe = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(blob_path), "-af",
                            "loudnorm=I=-18:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"], capture_output=True, text=True).stderr
    stats = json.loads(probe[probe.rindex("{"):])
    flt = ("loudnorm=I=-18:TP=-1.5:LRA=11:linear=true:measured_I={input_i}:measured_TP={input_tp}:"
           "measured_LRA={input_lra}:measured_thresh={input_thresh}:offset={target_offset}").format(**stats)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(blob_path), "-af", flt, "-ac", "1", "-ar", str(rate),
                    "-c:a", "libmp3lame", "-b:a", bitrate, "-map_metadata", "-1", str(tmp)], check=True)
    tmp.replace(target)


def step_audio(archive, budget):
    started = time.time()
    done = skipped = 0
    with tempfile.TemporaryDirectory() as scratch:
        for track, (suffix, rate, bitrate) in TRACKS.items():
            for chapter in range(1, 19):
                for verse in range(1, COUNTS[chapter - 1] + 1):
                    target = MEDIA / track / str(chapter) / f"{verse}.mp3"
                    if target.is_file() and target.stat().st_size > 1000:
                        skipped += 1
                        continue
                    if time.time() - started > budget:
                        print(f"audio: budget reached - converted {done}, already present {skipped}. Re-run to continue.")
                        return False
                    name = f"gita/audio/CHAP{chapter}/{verse:02d}-{suffix}.ogg"
                    src = Path(scratch) / "in.ogg"
                    src.write_bytes(archive.read(name))
                    convert(src, target, rate, bitrate)
                    done += 1
    print(f"audio: converted {done}, already present {skipped}. All 2103 files ready.")
    return True


def step_meta():
    meta = json.loads((DATA / "meta.json").read_text(encoding="utf-8"))
    meta["edition"]["audioLanguage"] = "Sanskrit, Hindi, English"
    meta["audioTracks"] = [
        {"id": "sa", "label": "Sanskrit", "detail": "Verse recitation", "path": "sa"},
        {"id": "hi", "label": "Hindi", "detail": "Swami Tejomayananda's translation, narrated", "path": "hi", "translator": 17},
        {"id": "en", "label": "English", "detail": "Shri Purohit Swami's translation, narrated", "path": "en", "translator": 21},
        {"id": "chant", "label": "Sanskrit (slow chant)", "detail": "Original slow melodic chant", "path": None},
    ]
    write_json(DATA / "meta.json", meta)
    manifest_path = DATA / "import_manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["edition"] = meta["edition"]
    hashes = {}
    for track in TRACKS:
        hashes[track] = {}
        for chapter in range(1, 19):
            for verse in range(1, COUNTS[chapter - 1] + 1):
                p = MEDIA / track / str(chapter) / f"{verse}.mp3"
                assert p.is_file(), f"missing {p}"
                hashes[track][f"{chapter}.{verse}"] = hashlib.sha256(p.read_bytes()).hexdigest()
    manifest["audioSHA256Tracks"] = hashes
    manifest["supplementarySource"] = "gita.zip (text/ + audio/CHAP*/): Sanskrit spelling fixes, Purohit Swami wording, sa/hi/en recordings"
    write_json(manifest_path, manifest)
    print("meta: audio tracks and manifest written")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", required=True)
    parser.add_argument("--steps", default="text,audio,meta")
    parser.add_argument("--budget", type=float, default=240, help="seconds the audio step may run before pausing")
    args = parser.parse_args()
    steps = args.steps.split(",")
    with zipfile.ZipFile(args.source) as z:
        if "text" in steps:
            step_text(z)
        complete = True
        if "audio" in steps:
            complete = step_audio(z, args.budget)
    if "meta" in steps and complete:
        step_meta()

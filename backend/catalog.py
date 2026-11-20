"""Read-only scripture repository and Unicode-aware multilingual search."""
from functools import lru_cache
from pathlib import Path
import json
import re
import unicodedata


def normalize(value):
    value = unicodedata.normalize("NFD", value)
    value = "".join(c for c in value if not "\u0300" <= c <= "\u036f")
    value = unicodedata.normalize("NFC", value).lower()
    return re.sub(r"\s+", " ", re.sub(r"[।॥|.,;:!?\"'“”‘’()\-—–\d]", " ", value)).strip()


class Catalog:
    def __init__(self, data_dir, media_dir):
        self.data_dir, self.media_dir = Path(data_dir), Path(media_dir)
        self.meta = self.read_json("meta.json")
        self.counts = {c["number"]: c["versesCount"] for c in self.meta["chapters"]}

    def read_json(self, relative):
        return json.loads((self.data_dir / relative).read_text(encoding="utf-8"))

    def valid(self, chapter, verse=1):
        return chapter in self.counts and 1 <= verse <= self.counts[chapter]

    @lru_cache(maxsize=4)
    def chapter(self, number):
        return self.read_json(f"chapters/{number}.json")

    @lru_cache(maxsize=8)
    def commentary(self, chapter, author):
        return self.read_json(f"commentary/{chapter}/{author}.json")

    @lru_cache(maxsize=1)
    def search_rows(self):
        rows = self.read_json("search.json")
        for row in rows:
            fields = [("sanskrit", None, row["sanskrit"]), ("transliteration", None, row["transliteration"])]
            fields += [(t["lang"], t["author_id"], t["text"]) for t in row["translations"]]
            row["fields"] = [(lang, author, text, normalize(text)) for lang, author, text in fields]
        return rows

    def search(self, query, language="all", chapter=None, offset=0, limit=20):
        reference = re.fullmatch(r"(?:bg|gita|chapter|ch)?\s*(\d{1,2})(?:\s*[.:/]\s*(\d{1,3}))?", query.strip(), re.I)
        needle = normalize(query)
        hits = []
        if not reference and len(needle) < 2:
            return {"results": [], "total": 0, "offset": offset, "limit": limit}
        for row in self.search_rows():
            c, v = row["chapter"], row["verse"]
            if chapter and c != chapter:
                continue
            if reference and (c != int(reference[1]) or (reference[2] and v != int(reference[2]))):
                continue
            for lang, author, text, hay in row["fields"]:
                if language != "all" and lang != language:
                    continue
                if reference or needle in hay or needle.replace(" ", "") in hay.replace(" ", ""):
                    flat = re.sub(r"\s+", " ", text)
                    hits.append({"chapter": c, "verse": v, "field": lang, "authorId": author,
                                 "snippet": flat[:240] + ("…" if len(flat) > 240 else "")})
                    break
        return {"results": hits[offset:offset + limit], "total": len(hits), "offset": offset, "limit": limit}

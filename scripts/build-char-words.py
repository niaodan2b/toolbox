#!/usr/bin/env python3
"""Build char -> common ending-words index from jieba dict.txt."""

from __future__ import annotations

import json
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHAR_PINYIN = ROOT / "src" / "datasets" / "char_pinyin.json"
OUT = ROOT / "src" / "datasets" / "char_words.json"
DICT_URL = "https://raw.githubusercontent.com/fxsjy/jieba/master/jieba/dict.txt"
MAX_WORDS = 16
MIN_LEN = 2
MAX_LEN = 4
PROXY = "http://127.0.0.1:7897"

HAN = frozenset(chr(c) for c in range(0x4E00, 0x9FFF + 1))


def fetch_dict() -> str:
    req = urllib.request.Request(DICT_URL, headers={"User-Agent": "toolbox-build-char-words"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.read().decode("utf-8")
    except Exception:
        proxy = urllib.request.ProxyHandler({"http": PROXY, "https": PROXY})
        opener = urllib.request.build_opener(proxy)
        with opener.open(req, timeout=60) as resp:
            return resp.read().decode("utf-8")


def is_han_word(word: str) -> bool:
    return all(ch in HAN for ch in word)


def main() -> None:
    with CHAR_PINYIN.open(encoding="utf-8") as f:
        chars = {entry["char"] for entry in json.load(f)}

    buckets: dict[str, list[tuple[int, str]]] = defaultdict(list)
    for line in fetch_dict().splitlines():
        parts = line.split()
        if len(parts) < 2:
            continue
        word, freq_s = parts[0], parts[1]
        n = len(word)
        if n < MIN_LEN or n > MAX_LEN or not is_han_word(word):
            continue
        last = word[-1]
        if last not in chars:
            continue
        try:
            freq = int(freq_s)
        except ValueError:
            continue
        buckets[last].append((freq, word))

    out: dict[str, list[str]] = {}
    for char, items in buckets.items():
        items.sort(key=lambda x: (-x[0], x[1]))
        seen: set[str] = set()
        words: list[str] = []
        for _, word in items:
            if word == char or word in seen:
                continue
            seen.add(word)
            words.append(word)
            if len(words) >= MAX_WORDS:
                break
        if words:
            out[char] = words

    ordered = {k: out[k] for k in sorted(out)}
    OUT.write_text(json.dumps(ordered, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT} ({len(ordered)} chars)")


if __name__ == "__main__":
    main()

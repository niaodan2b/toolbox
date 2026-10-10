#!/usr/bin/env python3
"""Extend src/datasets/char_pinyin.json with the tail characters that block common words.

为什么需要
---------
查韵按「尾字」给词分组，所以一个词能否出现，取决于它的**最后一个字**是否在
char_pinyin.json 的字表里。原字表只有 3749 字，导致 `尴尬`、`憧憬`、`朦胧`、
`温馨`、`憔悴`、`时髦` 这类常用词整条进不来——它们的尾字（尬/憬/胧/馨/悴/髦）
不在表内。

本脚本只补「确实挡住前 N 名常用词」的那批字，**不动现有 3749 条**，也不重建整表。
读音直接取自《现代汉语常用词表》自带的拼音列（scripts/.cache/xiandai-changyong.txt），
不需要联网，也不引入第二套拼音规范。

Usage:
    python3 scripts/extend-char-pinyin.py            # 预览
    python3 scripts/extend-char-pinyin.py --write     # 写入 char_pinyin.json
    python3 scripts/extend-char-pinyin.py --top 30000 # 放宽到前 3 万词所需的尾字
"""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHAR_PINYIN = ROOT / "src" / "datasets" / "char_pinyin.json"
WORDFREQ = ROOT / "scripts" / ".cache" / "wordfreq.json"
MODERN = ROOT / "scripts" / ".cache" / "xiandai-changyong.txt"

MIN_LEN, MAX_LEN = 2, 6

# 声调数字 -> 带调元音。顺序重要：先匹配双字母（üe 之类由 ü 单独处理）
TONE_MARKS = {
    "a": "āáǎà", "o": "ōóǒò", "e": "ēéěè",
    "i": "īíǐì", "u": "ūúǔù", "ü": "ǖǘǚǜ",
}


def toned(syllable: str) -> str | None:
    """`zhang3` -> `zhǎng`；声调落在 a/o/e 优先，iu/ui 落在后一个元音。"""
    if not syllable:
        return None
    tone = 0
    if syllable[-1].isdigit():
        tone = int(syllable[-1])
        syllable = syllable[:-1]
    if tone == 0 or not syllable:
        return syllable or None
    if "ü" in syllable:
        target = "ü"
    elif "a" in syllable:
        target = "a"
    elif "o" in syllable:
        target = "o"
    elif "e" in syllable:
        target = "e"
    elif "iu" in syllable:
        target = "u"
    elif "ui" in syllable:
        target = "i"
    elif "i" in syllable:
        target = "i"
    elif "u" in syllable:
        target = "u"
    else:
        return syllable
    idx = syllable.rindex(target) if target == "u" and "iu" in syllable else syllable.index(target)
    return syllable[:idx] + TONE_MARKS[target][tone - 1] + syllable[idx + 1:]


INITIALS = ["zh", "ch", "sh", "b", "p", "m", "f", "d", "t", "n", "l", "g", "k",
            "h", "j", "q", "x", "r", "z", "c", "s", "y", "w"]


def yunmu(plain: str) -> str:
    """从无调拼音里取韵母。

    这套规则与现有 char_pinyin.json 的 3749 条逐条对拍、零差异（见仓库说明），
    所以新增条目与旧条目的口径完全一致。
    """
    p = plain.replace("ü", "v")
    for ini in INITIALS:
        if not p.startswith(ini):
            continue
        rest = p[len(ini):]
        if ini in ("j", "q", "x"):
            r = ("ü" + rest[1:]) if rest.startswith("u") else rest
        elif ini == "y":
            if rest.startswith("u"):
                r = ("ü" + rest[1:]) if len(rest) > 1 else "ü"
            elif rest.startswith("i"):
                r = rest
            elif rest.startswith("o"):
                r = "i" + rest[1:] if rest == "ou" else ("o" if rest == "o" else "i" + rest)
            elif rest and rest[0] in "ae":
                r = "i" + rest
            else:
                r = rest or "i"
        elif ini == "w":
            if rest.startswith("u"):
                r = rest
            elif rest == "ei":
                r = "ui"
            elif rest == "en":
                r = "un"
            elif rest == "eng":
                r = "ueng"
            else:
                r = "u" + rest
        else:
            r = rest
        return r.replace("v", "ü")
    return p.replace("v", "ü")


def strip_tone(syllable: str) -> str:
    out = []
    for ch in syllable:
        for base, marked in TONE_MARKS.items():
            if ch in marked:
                out.append(base)
                break
        else:
            out.append(ch)
    return "".join(out)


def collect_readings() -> dict[str, Counter]:
    """从常用词表的拼音列统计每个字的读音。"""
    readings: dict[str, Counter] = defaultdict(Counter)
    for line in MODERN.read_text(encoding="utf-8").splitlines():
        parts = line.split("\t")
        if len(parts) != 3:
            continue
        word, pinyin = parts[0], parts[1]
        syllables = pinyin.split("'")
        if len(syllables) != len(word):
            continue
        for ch, raw in zip(word, syllables):
            converted = toned(raw)
            if converted:
                readings[ch][converted] += 1
    return readings


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="写入 char_pinyin.json")
    ap.add_argument("--top", type=int, default=20000, help="按常用词表前多少名决定要补哪些尾字")
    args = ap.parse_args()

    if not WORDFREQ.exists():
        raise SystemExit("缺少 scripts/.cache/wordfreq.json，请先运行 scripts/fetch-wordfreq.py")

    entries: list[dict] = json.loads(CHAR_PINYIN.read_text(encoding="utf-8"))
    existing = {e["char"] for e in entries}
    wf: dict[str, dict[str, int]] = json.loads(WORDFREQ.read_text(encoding="utf-8"))

    # 哪些尾字挡住了常用词
    blockers: dict[str, list[tuple[int, str]]] = defaultdict(list)
    for word, meta in wf.items():
        if "m" not in meta or meta["m"] > args.top:
            continue
        if not (MIN_LEN <= len(word) <= MAX_LEN):
            continue
        if not all("\u4e00" <= c <= "\u9fff" for c in word):
            continue
        tail = word[-1]
        if tail not in existing:
            blockers[tail].append((meta["m"], word))

    if not blockers:
        print("无需补字：常用词表前 %d 名的尾字都已在字表内" % args.top)
        return 0

    readings = collect_readings()
    added: list[dict] = []
    no_reading: list[str] = []
    for ch in sorted(blockers, key=lambda c: min(r for r, _w in blockers[c])):
        counts = readings.get(ch)
        if not counts:
            no_reading.append(ch)
            continue
        pinyins = [p for p, _n in counts.most_common()]
        # 去掉无调重复：已有带调版本时不再单列无调形式
        plains = []
        for p in pinyins:
            plain = strip_tone(p)
            if plain not in plains:
                plains.append(plain)
        added.append({
            "char": ch,
            "pinyin": pinyins,
            "yunmu": [yunmu(p) for p in plains],
            "pinyin_plain": plains,
        })

    print(f"字表现有 {len(existing)} 字；前 {args.top} 名常用词里有 {len(blockers)} 个尾字不在表内")
    print(f"  可补（有拼音）：{len(added)}")
    if no_reading:
        print(f"  缺拼音无法补：{len(no_reading)} → {''.join(no_reading)}")
    for e in added[:12]:
        unlock = sorted(blockers[e["char"]])[0]
        print(f"  {e['char']} {e['pinyin']} 韵母={e['yunmu']}  解锁：{unlock[1]}({unlock[0]})")
    print(f"  …共 {len(added)} 个")

    if args.write:
        merged = entries + added
        merged.sort(key=lambda e: ord(e["char"]))  # 与原文件一致：按码位升序
        CHAR_PINYIN.write_text(
            json.dumps(merged, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(f"wrote {CHAR_PINYIN.relative_to(ROOT)}（{len(entries)} -> {len(merged)} 字）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

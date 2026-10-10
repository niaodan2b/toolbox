#!/usr/bin/env python3
"""Rebuild src/datasets/char_words.json from curated word-frequency sources.

Why not jieba
-------------
The old pipeline took jieba's segmentation dict.txt as if it were a word-frequency
list. That dict is 21% person names and carries segmentation fragments, so 28.1% of
the resulting list was proper nouns or junk and only 51.6% was usable
(see scripts/audit-char-words.py / audit-char-words.md).

Sources (see scripts/fetch-wordfreq.py)
---------------------------------------
- M 《现代汉语常用词表》56,008 词，人工审定，带频序号（1 = 最高频）
- S SUBTLEX-CH 影视字幕词频（33.5M 词 / 6,243 部影视）
- J jieba dict.txt 的**干净**部分，仅作为覆盖率不足时的兜底，并明确标注来源

Ranking
-------
M 的频序号和 S 的字幕词频是两种尺度，先按「序号区间 -> 字幕词频中位数」标定成
可比的 log 尺度再排序；字幕缺失的 M 词条按标定值折扣计入，避免被误判成冷门词。

注：曾有一版用 chinese-poetry 的诗词词形补充文言词（`scripts/fetch-poetry-words.py`
仍在仓库里，作为备用数据源），但文言/生僻词不符合查韵的使用场景，已从词表中撤下。

Usage:
    python3 scripts/build-char-words.py                 # 输出到 scripts/.cache/char_words_new.json
    python3 scripts/build-char-words.py --write          # 同时覆盖 src/datasets/char_words.json
    python3 scripts/build-char-words.py --min-words 8    # 少于该数量的字启用 jieba 兜底
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHAR_PINYIN = ROOT / "src" / "datasets" / "char_pinyin.json"
CHAR_WORDS = ROOT / "src" / "datasets" / "char_words.json"
MANIFEST = ROOT / "src" / "datasets" / "char_words.sources.json"
CACHE = ROOT / "scripts" / ".cache"
WORDFREQ = CACHE / "wordfreq.json"
JIEBA = CACHE / "jieba-dict.txt"

MAX_WORDS = 50          # 每个字最多保留多少词（原为 16，会丢掉大量常用词）
MIN_LEN, MAX_LEN = 2, 6   # 放开到 6 字，收进「人民代表大会」这类长词
FALLBACK_MIN_FREQ = 20  # jieba 兜底词的最低词频（调低会引进「化骨绵」「代烷」这类生僻/异常词条）
FALLBACK_MIN_WORDS = 50  # 新源候选少于该数量时才启用兜底（与 MAX_WORDS 一致）
MAX_FALLBACK_SHARE = 0.5  # 兜底词占单字列表的比例上限

# 仅字幕（S）词条的准入线。字幕语料里人名/品牌很多（赫敏、张彩敏、道康…），
# 特征是高词频但只集中在少数几部片子，所以用「出现影片数 cd」当主要闸门。
S_ONLY_MIN_COUNT = 40        # 且总词频 ≥ 40（两字词门槛翻倍）

# 序号区间 -> 字幕词频（百万分之）的经验标定；由两源共存词条的中位数拟合
# 序号 -> 等价字幕词频（百万分之）的标定锚点，来自两源共存词条的中位数
RANK_CALIBRATION = [
    (1, 20000.0),
    (500, 6000.0),
    (1000, 3000.0),
    (2000, 1200.0),
    (5000, 670.0),
    (10000, 157.0),
    (15000, 100.0),
    (20000, 75.0),
    (25000, 68.0),
    (30000, 62.0),
    (40000, 58.0),
    (56008, 50.0),
]


def calibrate(rank: int) -> float:
    """把词表序号插值成等价的字幕词频。

    必须是单调的：早先的阶梯实现会把 1–5000 名全部映射到 670，再乘一个折扣，
    结果所有「只有常用词表背书、没有字幕数据」的词都被压进同一个窄带，
    只能按字典序排，`负责人`、`诗人`、`身子` 这类常用词就这样被挤出名额。
    """
    anchors = RANK_CALIBRATION
    if rank <= anchors[0][0]:
        return anchors[0][1]
    for (r0, v0), (r1, v1) in zip(anchors, anchors[1:]):
        if rank <= r1:
            t = (rank - r0) / (r1 - r0)
            return math.exp(math.log(v0) + t * (math.log(v1) - math.log(v0)))
    return anchors[-1][1]



def load_audit_module():
    """复用审计脚本里的 A/B 档判定规则，避免两套规则漂移。"""
    spec = importlib.util.spec_from_file_location(
        "audit_char_words", ROOT / "scripts" / "audit-char-words.py"
    )
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def composite(entry: dict[str, int], missing_discount: float = 1.0) -> tuple[float, str]:
    """把 (常用词表序号, 字幕词频) 合成一个可比的分数，越大越常用。"""
    has_m = "m" in entry
    has_s = "s" in entry
    if has_s:
        base = math.log10(entry["s"] + 1)
        source = "MS" if has_m else "S"
    else:
        base = 0.0
        source = "M"
    if has_m:
        cal = math.log10(calibrate(entry["m"]) + 1)
        if has_s:
            base = max(base, cal)  # 两源都有：取更高的一侧，避免被字幕漏检拖低
        else:
            # 只有常用词表背书（无字幕数据）：按标定值计入。
            # 折扣已改为 1.0——打折会让这批词整体沉到所有字幕词之下。
            base = cal * missing_discount
    return base, source


def subtitle_only_ok(word: str, entry: dict[str, int], cd_min: int) -> bool:
    """仅字幕来源的词条是否可信。

    人名/品牌在字幕语料里的典型形态是「高词频、低影片覆盖」，
    因此要求同时满足覆盖度（cd）和频次，两字词门槛翻倍。
    """
    if "m" in entry:
        return True
    count = entry.get("s", 0)
    cd = entry.get("cd", 0)
    if len(word) <= 2:
        return cd >= cd_min * 2 and count >= S_ONLY_MIN_COUNT * 2
    return cd >= cd_min and count >= S_ONLY_MIN_COUNT


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="覆盖 src/datasets/char_words.json")
    ap.add_argument("--min-words", type=int, default=FALLBACK_MIN_WORDS)
    ap.add_argument("--no-fallback", action="store_true", help="不使用 jieba 兜底")
    ap.add_argument("--fallback-min-freq", type=int, default=FALLBACK_MIN_FREQ,
                    help="jieba 兜底词的最低词频")
    ap.add_argument("--s-only-cd", type=int, default=120,
                    help="仅字幕来源词条至少出现在多少部影视里（两字词按两倍计）")
    args = ap.parse_args()

    if not WORDFREQ.exists():
        raise SystemExit("缺少 scripts/.cache/wordfreq.json，请先运行 scripts/fetch-wordfreq.py")

    wf: dict[str, dict[str, int]] = json.loads(WORDFREQ.read_text(encoding="utf-8"))
    chars = [e["char"] for e in json.loads(CHAR_PINYIN.read_text(encoding="utf-8"))]
    char_set = set(chars)

    # ---- 主源：排序 + 按尾字分桶 ------------------------------------------
    scored: dict[str, tuple[float, str]] = {}
    rejected_s_only = 0
    for word, entry in wf.items():
        n = len(word)
        if n < MIN_LEN or n > MAX_LEN:
            continue
        if word[-1] not in char_set:
            continue
        if not subtitle_only_ok(word, entry, args.s_only_cd):
            rejected_s_only += 1
            continue
        scored[word] = composite(entry)
    print(f"主源候选 {len(scored)} 词（仅字幕来源被准入线拦下 {rejected_s_only} 个）")

    buckets: dict[str, list[tuple[float, str, str]]] = defaultdict(list)
    for word, (score, source) in scored.items():
        buckets[word[-1]].append((score, word, source))

    # ---- 兜底词典：jieba 的干净部分 ----------------------------------------
    audit = load_audit_module()
    clf = None
    jieba_rows: list[tuple[str, int, str]] = []
    if args.no_fallback:
        print("按 --no-fallback 跳过 jieba 兜底")
    elif not JIEBA.exists():
        print("warn: 没有 jieba 兜底词典，跳过兜底", file=sys.stderr)
    else:
        jieba_rows = audit.load_dict(JIEBA)
        clf = audit.Classifier(jieba_rows)

    fallback_pool: dict[str, list[tuple[float, str]]] = defaultdict(list)
    if clf is not None:
        for word, freq, _tag in jieba_rows:
            n = len(word)
            if n < MIN_LEN or n > MAX_LEN or word[-1] not in char_set:
                continue
            if word in scored:
                continue
            # 把 jieba 词频折成与主源相近的 log 尺度（jieba 词频量级远小于字幕百万词频）
            score = math.log10(freq + 1) - 2.0
            if clf.classify(word) or freq < args.fallback_min_freq:
                continue
            fallback_pool[word[-1]].append((score, word))

    # ---- 组装 --------------------------------------------------------------
    out: dict[str, list[str]] = {}
    sources_of: dict[str, str] = {}
    fallback_counts: Counter[str] = Counter()
    out_sources: dict[str, str] = {}
    reason_stats: Counter[str] = Counter()

    for char in chars:
        # 严格分层：先放满所有有权威背书的词（MS/M/S），不足时才用 jieba 兜底词补位。
        # 兜底词不与主源词混在同一分数队列里竞争，否则会挤掉「负责人、诗人」这类
        # 只有《现代汉语常用词表》背书、没有字幕词频的常用词。
        primary = sorted(buckets.get(char, []), key=lambda x: (-x[0], len(x[1]), x[1]))
        chosen: list[tuple[str, str]] = []
        seen: set[str] = set()
        for _s, word, src in primary:
            if len(chosen) >= MAX_WORDS:
                break
            if word in seen:
                continue
            seen.add(word)
            chosen.append((word, src))
        used_fallback = 0
        if clf is not None and len(chosen) < args.min_words:
            for _s, word in sorted(fallback_pool.get(char, []), key=lambda x: (-x[0], x[1])):
                if len(chosen) >= min(args.min_words, MAX_WORDS):
                    break
                if word in seen:
                    continue
                seen.add(word)
                chosen.append((word, "J"))
                used_fallback += 1
            if used_fallback:
                fallback_counts[char] = used_fallback
        if not chosen:
            reason_stats["完全没有候选"] += 1
            continue
        out[char] = [w for w, _src in chosen]
        for _w, src in chosen:
            out_sources[_w] = src
            reason_stats[f"来源 {src}"] += 1

    ordered = {k: out[k] for k in sorted(out)}
    CACHE.mkdir(parents=True, exist_ok=True)
    tmp = CACHE / "char_words_new.json"
    tmp.write_text(
        json.dumps(ordered, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )

    total = sum(len(v) for v in ordered.values())
    full = sum(1 for v in ordered.values() if len(v) >= MAX_WORDS)
    under = sum(1 for v in ordered.values() if len(v) < 8)
    print(f"新词表：{len(ordered)} 字 / {total} 词（满 {MAX_WORDS} 词 {full} 字，不足 8 词 {under} 字）")
    for k, v in reason_stats.most_common():
        print(f"  {k}: {v}")
    print(f"  使用 jieba 兜底的字: {len(fallback_counts)}（共 {sum(fallback_counts.values())} 词）")
    print(f"wrote {tmp.relative_to(ROOT)}")

    # 覆盖率体检：权威源前 2 万词里有多少进了词表
    top20k = {
        w for w, e in wf.items()
        if "m" in e and e["m"] <= 20000 and MIN_LEN <= len(w) <= MAX_LEN and w[-1] in char_set
    }
    kept = set(ordered) and {w for v in ordered.values() for w in v}
    covered = len(top20k & kept)
    print(f"权威源前 2 万词收录率：{covered}/{len(top20k)}（{100 * covered / max(len(top20k), 1):.1f}%）")
    print(f"其中仅常用词表背书（无字幕数据）的词：{sum(1 for w in kept if 'm' in wf.get(w, {}) and 's' not in wf.get(w, {}))}")

    manifest = {
        "generatedBy": "scripts/build-char-words.py",
        "maxWordsPerChar": MAX_WORDS,
        "sources": {
            "M": {
                "name": "现代汉语常用词表",
                "url": "https://github.com/liangqi/chinese-frequency-word-list",
                "note": "56,008 词人工审定词表，含频序号",
            },
            "S": {
                "name": "SUBTLEX-CH",
                "url": "https://github.com/leonsilicon/subtlex-ch-wf",
                "note": "影视字幕词频，33.5M 词 / 6,243 部影视；仅字幕来源需通过影片覆盖度准入线",
            },
            "J": {
                "name": "jieba dict.txt（干净子集）",
                "url": "https://github.com/fxsjy/jieba",
                "note": "仅用于覆盖率兜底；已剔除专名、数量词与分词碎片",
            },
        },
        "legend": {
            "MS": "常用词表 + 字幕都有",
            "M": "仅常用词表",
            "S": "仅字幕词频",
            "J": "jieba 兜底",
        },
        "chars": len(ordered),
        "words": total,
        "fallbackChars": len(fallback_counts),
        "top20kCoverage": f"{covered}/{len(top20k)}",
    }

    if args.write:
        CHAR_WORDS.write_text(
            json.dumps(ordered, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
        )
        MANIFEST.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(f"wrote {CHAR_WORDS.relative_to(ROOT)}")
        print(f"wrote {MANIFEST.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

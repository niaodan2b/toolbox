#!/usr/bin/env python3
"""Fetch and normalize the word-frequency sources used to rebuild 查韵's char_words.

Sources
-------
1. 《现代汉语常用词表》 (Modern Chinese Common Word List, 56,008 entries)
   https://github.com/liangqi/chinese-frequency-word-list
   Raw: xiandaihaiyuchangyongcibiao.txt
   Format: `词<TAB>pin1'yin1<TAB>频序号` — 序号 1 表示最高频。人工审定的书面语常用词表。

2. SUBTLEX-CH word frequencies (影视字幕语料, 33.5M words / 6,243 部影视)
   https://github.com/leonsilicon/subtlex-ch-wf
   Raw: data/SUBTLEX-CH-WF  (GBK 编码, CRLF, 前几行为元数据)
   Format: `Word<TAB>WCount<TAB>W/million<TAB>logW<TAB>W-CD<TAB>W-CD%<TAB>logW-CD`
           W-CD = 该词出现在多少部影视里（contextual diversity），用来识别人名：
           人名往往总频次偏高但只集中在少数几部片子里。

Outputs (cache, 不入库)
-------
- scripts/.cache/xiandai-changyong.txt  原始常用词表
- scripts/.cache/subtlex-ch-wf.txt      SUBTLEX-CH 转成 UTF-8，留 词<TAB>词频<TAB>影片数
- scripts/.cache/wordfreq.json          {word: {"m": 序号, "s": 字幕词频, "cd": 影片数}}

Usage:
    python3 scripts/fetch-wordfreq.py            # 用缓存，缺哪个下哪个
    python3 scripts/fetch-wordfreq.py --refresh  # 强制重新下载
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "scripts" / ".cache"

MODERN_FILE = CACHE / "xiandai-changyong.txt"
SUBTLEX_FILE = CACHE / "subtlex-ch-wf.txt"
MERGED = CACHE / "wordfreq.json"

MODERN_URL = (
    "https://raw.githubusercontent.com/liangqi/chinese-frequency-word-list"
    "/master/xiandaihaiyuchangyongcibiao.txt"
)
SUBTLEX_URL = (
    "https://raw.githubusercontent.com/leonsilicon/subtlex-ch-wf/main/data/SUBTLEX-CH-WF"
)

# 只保留纯汉字的 2–6 字词条：查韵按字查词，夹拉丁字母/数字的条目没有意义；
# 5–6 字保留给「马克思主义 / 人民代表大会」这类固定短语（数量很少，不影响体积）
HAN_RE = re.compile(r"^[\u4e00-\u9fff]+$")
MIN_LEN, MAX_LEN = 2, 6

# 常用词表里混入的语料噪声：以虚词/单字功能词收尾的条目（如「不久汪」「步唯艰」）
FUNC_TAILS = set("的了着过和与及或而就都也还很太更再才只又乃亦仅皆却遂")


def fetch(url: str, out: Path, attempts: int = 6, expect_size: int | None = None) -> bytes:
    """curl 下载，支持断点续传。

    raw.githubusercontent 在本机会偶发截断（下到一半连接被掐），所以用 `-C -`
    反复续传，直到拿到完整文件（或达到 attempts 上限）。
    """
    out.parent.mkdir(parents=True, exist_ok=True)
    last = ""
    for i in range(1, attempts + 1):
        proc = subprocess.run(
            [
                "curl", "-sS", "-L", "-C", "-", "--max-time", "60",
                "-o", str(out), "-w", "%{http_code}", url,
            ],
            capture_output=True,
            text=True,
        )
        code = proc.stdout.strip()
        size = out.stat().st_size if out.exists() else 0
        if expect_size and size >= expect_size:
            return out.read_bytes()
        if not expect_size and code == "200" and size > 1000:
            # 无法预知大小时，用「本轮没有再增长」判断完成
            if i > 1 and size == _PREV.get(url):
                return out.read_bytes()
        _PREV[url] = size
        last = f"http={code} size={size}"
        if i < attempts:
            time.sleep(2)
    if out.exists() and out.stat().st_size > 1000:
        print(f"warn: {url} 未能确认完整（{last}），按现有 {out.stat().st_size} 字节继续", file=sys.stderr)
        return out.read_bytes()
    raise SystemExit(f"download failed: {url} ({last})")


_PREV: dict[str, int] = {}


def load_modern(refresh: bool) -> dict[str, int]:
    """《现代汉语常用词表》 -> {词: 频序号}（1 = 最高频）。"""
    if refresh or not MODERN_FILE.exists():
        print(f"fetching {MODERN_URL}")
        fetch(MODERN_URL, MODERN_FILE)

    out: dict[str, int] = {}
    dup = 0
    for line in MODERN_FILE.read_text(encoding="utf-8").splitlines():
        parts = line.split("\t")
        if len(parts) != 3:
            continue
        word, _pinyin, rank_s = parts
        if not HAN_RE.match(word) or not (MIN_LEN <= len(word) <= MAX_LEN):
            continue
        try:
            rank = int(rank_s)
        except ValueError:
            continue
        if word in out:
            dup += 1
            rank = min(rank, out[word])
        out[word] = rank
    print(f"常用词表: {len(out)} 个纯汉字词条（重复 {dup}）")
    return out


def load_subtlex(refresh: bool) -> dict[str, tuple[int, int]]:
    """SUBTLEX-CH -> {词: (字幕词频, 出现影片数)}。

    源文件是 GBK，转存为 UTF-8 的 `词<TAB>词频<TAB>影片数`。
    """
    if refresh or not SUBTLEX_FILE.exists():
        print(f"fetching {SUBTLEX_URL}")
        raw = fetch(SUBTLEX_URL, CACHE / "subtlex-ch-wf.gbk", expect_size=3_230_773)
        text = raw.decode("gbk", errors="replace")
        lines_out: list[str] = []
        for line in text.splitlines():
            parts = line.rstrip("\r").split("\t")
            if len(parts) < 5:
                continue
            word, count, _per_million, _logw, cd = parts[:5]
            if not HAN_RE.match(word) or not (MIN_LEN <= len(word) <= MAX_LEN):
                continue
            try:
                n = int(count)
                contexts = int(cd)
            except ValueError:
                continue  # 元数据行 / 表头
            lines_out.append(f"{word}\t{n}\t{contexts}")
        SUBTLEX_FILE.write_text("\n".join(lines_out) + "\n", encoding="utf-8")

    out: dict[str, tuple[int, int]] = {}
    for line in SUBTLEX_FILE.read_text(encoding="utf-8").splitlines():
        word, _, rest = line.partition("\t")
        count_s, _, cd_s = rest.partition("\t")
        if not word or not count_s:
            continue
        prev = out.get(word)
        item = (int(count_s), int(cd_s) if cd_s else 0)
        out[word] = item if prev is None else (max(prev[0], item[0]), max(prev[1], item[1]))
    print(f"SUBTLEX-CH: {len(out)} 个纯汉字词条")
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true", help="强制重新下载源文件")
    args = ap.parse_args()

    modern = load_modern(args.refresh)
    subtlex = load_subtlex(args.refresh)

    merged: dict[str, dict[str, int]] = {}
    for word, rank in modern.items():
        merged.setdefault(word, {})["m"] = rank
    for word, (count, contexts) in subtlex.items():
        entry = merged.setdefault(word, {})
        entry["s"] = count
        entry["cd"] = contexts

    MERGED.parent.mkdir(parents=True, exist_ok=True)
    MERGED.write_text(
        json.dumps(merged, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )

    both = sum(1 for v in merged.values() if "m" in v and "s" in v)
    only_m = sum(1 for v in merged.values() if "m" in v and "s" not in v)
    only_s = sum(1 for v in merged.values() if "s" in v and "m" not in v)
    print(f"合并后 {len(merged)} 词：两源都有 {both}，仅常用词表 {only_m}，仅字幕 {only_s}")
    print(f"wrote {MERGED.relative_to(ROOT)}")
    print(f"  sha256(常用词表) = {hashlib.sha256(MODERN_FILE.read_bytes()).hexdigest()[:16]}…")
    print(f"  sha256(SUBTLEX)   = {hashlib.sha256(SUBTLEX_FILE.read_bytes()).hexdigest()[:16]}…")
    return 0


if __name__ == "__main__":
    sys.exit(main())

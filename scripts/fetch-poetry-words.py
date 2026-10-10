#!/usr/bin/env python3
"""Mine classical Chinese word forms (词形) from chinese-poetry as a supplementary source.

Why a poetry source
-------------------
查韵是给写词/写文案找押韵词用的。现代口语词表（常用词表 / SUBTLEX）在「伸、襄、靖」
这类字上几乎没词，而诗词语料里恰恰有「以屈求伸」「未伸」「求伸」这类押韵常用搭配。
chinese-poetry（MIT 许可，5.3 万星）的宋词/元曲/全唐诗/蒙学是干净的公有领域语料。

为什么用「句末位置」当证据
-------------------------
单纯统计 2–4 字 n-gram 会切出 `山互`、`月互`、`人但` 这类跨词碎片。
诗词的句尾几乎总落在词或词组的边界上，所以「句末出现次数」是判断 n-gram
是否为真实词形的强信号。实测以句末次数为主闸门后，「伸」得到的是
「屈伸/欠伸/未伸/求伸」，而不是「时伸/长伸」。

过滤规则（满足其一）
- 句末次数 ≥ 3 且 总次数 ≥ 8
- 句末次数 ≥ 5 且 句末占比 ≥ 0.6（短句/集句里的词形）

输出 scripts/.cache/poetry-words.json：
    {词: {"n": 总次数, "e": 句末次数, "src": 来源类数, "p": 诗歌类来源数}}

Usage:
    python3 scripts/fetch-poetry-words.py             # 用缓存语料
    python3 scripts/fetch-poetry-words.py --refresh   # 重新 clone/checkout 语料
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "scripts" / ".cache"
REPO_DIR = CACHE / "chinese-poetry"
OUT = CACHE / "poetry-words.json"
CHAR_PINYIN = ROOT / "src" / "datasets" / "char_pinyin.json"

REPO_URL = "https://github.com/chinese-poetry/chinese-poetry.git"
COLLECTIONS = ["宋词", "元曲", "全唐诗", "蒙学", "五代诗词"]
POETIC = {"宋词", "元曲", "全唐诗", "五代诗词"}

MIN_LEN, MAX_LEN = 2, 4
END_MIN, TOTAL_MIN = 3, 8           # 规则一
END_MIN_STRICT, END_RATIO = 5, 0.6  # 规则二

SPLIT_RE = re.compile(r"[，。！？；：、,.!?;:\s“”‘’（）()《》〈〉【】\[\]—…·|\-/\d]+")
HAN_RE = re.compile(r"^[\u4e00-\u9fff]+$")
# 全唐诗里有大量目录/卷次条目（卷十七、有七），用「汉字串里的数字字密度」挡掉
NUMERAL = set("一二三四五六七八九十百千万两卅廿")


def numeral_heavy(chunk: str) -> bool:
    return sum(1 for ch in chunk if ch in NUMERAL) >= 2

# 繁->简 归一（只列诗词里高频出现的差异字；逐字对齐）
T2S = str.maketrans(
    "雲烟風雨聲詩詞語來時見處萬裏與無爲開關門問間聞東長馬鳥魚鳳鶴龍歸還遠緣獨"
    "隻雙歡樂愛戀憶夢歲華舊書畫筆墨紙硯琴瑟簫笛醉醒愁恨淚陽陰霜雪露霞虹霓夕朝"
    "暮曉夜闌幹樓臺閣軒齋廬舍庭園徑橋渡舟帆浪濤潮綠紅紫藍黃白黑青碧翠丹朱銀鐵"
    "銅鐘鼓鑼簫劍弓刀槍旗幟營寨堡牆壁階砌憶驚懼悲喜笑談說讀寫觀賞聽視見聞知識"
    "學問禮儀節慶賀賓客親友鄰裏飲食用飯菜湯茶酒藥醫治病疼痛癢疲倦勞苦貧窮富貴"
    "賤榮辱興廢盛衰體頭臉須發牙舌唇頸肩背胸腹腰腿腳趾筋骨血肉魂魄精氣神靈仙佛"
    "聖賢離合聚散逢別送迎歸去來",
    "云烟风雨声诗词语来时见处万里与无为开关门问间闻东长马鸟鱼凤鹤龙归还远缘独"
    "只双欢乐爱恋忆梦岁华旧书画笔墨纸砚琴瑟箫笛醉醒愁恨泪阳阴霜雪露霞虹霓夕朝"
    "暮晓夜阑干楼台阁轩斋庐舍庭园径桥渡舟帆浪涛潮绿红紫蓝黄白黑青碧翠丹朱银铁"
    "铜钟鼓锣箫剑弓刀枪旗帜营寨堡墙壁阶砌忆惊惧悲喜笑谈说读写观赏听视见闻知识"
    "学问礼仪节庆贺宾客亲友邻里饮食用饭菜汤茶酒药医治病疼痛痒疲倦劳苦贫穷富贵"
    "贱荣辱兴废盛衰体头脸须发牙舌唇颈肩背胸腹腰腿脚趾筋骨血肉魂魄精气神灵仙佛"
    "圣贤离合聚散逢别送迎归去来",
)


def ensure_repo(refresh: bool) -> Path:
    if refresh and REPO_DIR.exists():
        subprocess.run(["rm", "-rf", str(REPO_DIR)], check=True)
    if not (REPO_DIR / ".git").exists():
        REPO_DIR.parent.mkdir(parents=True, exist_ok=True)
        print(f"cloning {REPO_URL} (blobless)")
        subprocess.run(
            ["git", "clone", "--depth", "1", "--filter=blob:none", "--no-checkout",
             REPO_URL, str(REPO_DIR)],
            check=True,
        )
    subprocess.run(["git", "-C", str(REPO_DIR), "sparse-checkout", "init", "--cone"], check=False)
    subprocess.run(
        ["git", "-C", str(REPO_DIR), "sparse-checkout", "set", *COLLECTIONS], check=False
    )
    subprocess.run(["git", "-C", str(REPO_DIR), "checkout"], check=True)
    return REPO_DIR


def iter_chunks(root: Path):
    """产出 (语料名, 断句后的连续汉字串)。"""
    for name in COLLECTIONS:
        folder = root / name
        if not folder.exists():
            print(f"warn: 缺少语料目录 {name}", file=sys.stderr)
            continue
        for path in sorted(folder.rglob("*.json")):
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                continue
            for poem in data if isinstance(data, list) else []:
                if not isinstance(poem, dict):
                    continue
                for para in poem.get("paragraphs") or poem.get("content") or []:
                    if not isinstance(para, str):
                        continue
                    for chunk in SPLIT_RE.split(para.translate(T2S)):
                        if chunk and HAN_RE.match(chunk) and not numeral_heavy(chunk):
                            yield name, chunk


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true")
    args = ap.parse_args()

    chars = {e["char"] for e in json.loads(CHAR_PINYIN.read_text(encoding="utf-8"))}
    root = ensure_repo(args.refresh)

    counts: dict[str, int] = defaultdict(int)
    ends: dict[str, int] = defaultdict(int)
    sources: dict[str, set[str]] = defaultdict(set)
    lines = 0
    for name, chunk in iter_chunks(root):
        if numeral_heavy(chunk):
            continue
        lines += 1
        n = len(chunk)
        for size in range(MIN_LEN, MAX_LEN + 1):
            for start in range(0, n - size + 1):
                word = chunk[start : start + size]
                if word[-1] not in chars:
                    continue
                if any(ch not in chars for ch in word):
                    continue
                counts[word] += 1
                sources[word].add(name)
                if start + size == n:  # 句末
                    ends[word] += 1

    out: dict[str, dict[str, int]] = {}
    for word, count in counts.items():
        end = ends.get(word, 0)
        if not (
            (end >= END_MIN and count >= TOTAL_MIN)
            or (end >= END_MIN_STRICT and end >= END_RATIO * count)
        ):
            continue
        srcs = sources[word]
        out[word] = {
            "n": count,
            "e": end,
            "src": len(srcs),
            "p": sum(1 for s in srcs if s in POETIC),
        }

    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"断句 {lines} 行，词形 {len(out)} 个"
          f"（句末≥{END_MIN}且总≥{TOTAL_MIN}，或句末≥{END_MIN_STRICT}且占比≥{END_RATIO}）")
    print(f"wrote {OUT.relative_to(ROOT)}")
    for char in ["伸", "襄", "靖", "敏", "康", "冲", "微", "水", "风", "七", "也", "互", "但"]:
        words = sorted((w for w in out if w[-1] == char), key=lambda w: -out[w]["e"])[:8]
        print(f"  {char}: {'、'.join(words) if words else '（无）'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

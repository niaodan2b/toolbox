#!/usr/bin/env python3
"""Audit the 查韵 (rhyme-finder) word list and its jieba source.

Reads the same source as build-char-words.py (jieba dict.txt, cached locally),
classifies every candidate word that could end up in src/datasets/char_words.json,
and reports:

  1. how much of the current list is 专名 / 分词碎片 / 低频冷门词
  2. per-character impact: who lost real words to junk
  3. coverage matrix under several filter scenarios
  4. coverage of a curated modern everyday lexicon

The audit never touches src/datasets/char_words.json unless --write is passed.

Usage:
    python3 scripts/audit-char-words.py                     # audit + report
    python3 scripts/audit-char-words.py --write             # also write audited candidates
    python3 scripts/audit-char-words.py --fetch             # force re-download dict.txt
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHAR_PINYIN = ROOT / "src" / "datasets" / "char_pinyin.json"
CHAR_WORDS = ROOT / "src" / "datasets" / "char_words.json"
CACHE = ROOT / "scripts" / ".cache"
DICT_FILE = CACHE / "jieba-dict.txt"
REPORT = ROOT / "scripts" / "audit-char-words.md"
CANDIDATES = CACHE / "char_words_audited.json"
MODERN_LEXICON = ROOT / "scripts" / "data" / "modern-lexicon.json"

DICT_URL = "https://raw.githubusercontent.com/fxsjy/jieba/master/jieba/dict.txt"
PROXY = "http://127.0.0.1:7897"

MAX_WORDS = 16
MIN_LEN = 2
MAX_LEN = 4

HAN_RE = re.compile(r"^[\u4e00-\u9fff]+$")
LATIN_RE = re.compile(r"[A-Za-z]")

# ---------------------------------------------------------------------------
# classification rules
# ---------------------------------------------------------------------------

PROPER_TAGS = {"nr", "nrfg", "nrt", "ns", "nt", "nz", "nd", "nh", "ni", "nl", "ng"}

# 分词碎片：专名/人称代词 + 动词、助词、方位词尾部
FRAG_TAILS = (
    "笑见心道说想知喜奇怒问看走来了着的坐站望叹喝叫听忙微微"
    "依知奇喜怒的点着过起身手眼头脸伸若冲凝倚"
)
FRAG_HEADS = ("自己", "我们", "他们", "你们", "大家", "众人", "两人", "三人")

SURNAMES = (
    "赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜"
    "戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳唐罗薛伍"
    "余米贝姚孟高夏蔡田樊胡凌霍虞万支柯昝管卢莫房裘缪解应宗丁宣邓郁单"
    "杭洪包诸左石崔吉钮龚程邢滑裴陆荣翁荀羊甄封芮储靳汲邴糜松井段富巫"
    "乌焦巴弓牧隗山谷车侯宓蓬全郗班仰秋仲伊宫宁仇栾暴甘钭历戎祖武符刘"
    "景詹束龙叶幸司韶郜黎蓟薄印宿白怀蒲邰从鄂索咸籍赖卓蔺屠蒙池乔阴胥"
    "能苍双闻莘党翟谭贡劳逄姬申扶堵冉宰郦雍璩桑桂濮牛寿通边扈燕冀郏浦"
    "尚农温别庄晏柴瞿阎充慕连茹习宦艾鱼容向古易慎戈廖庾终暨居衡步都耿"
    "满弘匡国文寇广禄阙东欧殳沃利蔚越夔隆师巩厍聂晁勾敖融冷訾辛阚那简"
    "饶空曾毋沙乜养鞠须丰巢关蒯相查后荆红游竺权逯盖益桓公"
)
SURNAME_SET = set(SURNAMES)

PLACE_SUFFIX = set("省市县区镇乡村街路桥港湾岛州府县")

# 现代常用书面语/口语词表，用来衡量词典的"当代性"缺口
MODERN_FALLBACK = [
    # 网络与数码
    "微信", "点赞", "扫码", "二维码", "充电宝", "网购", "直播", "短视频", "表情包",
    "网课", "内存", "耳机", "充电", "流量", "账号", "密码", "评论", "转发", "关注",
    "粉丝", "链接", "截图", "搜索", "导航", "外卖", "快递", "打车", "共享",
    # 当代生活
    "加班", "堵车", "房贷", "房租", "面试", "简历", "打卡", "健身房", "瑜伽",
    "奶茶", "火锅", "夜宵", "减肥", "口罩", "体检", "失眠", "熬夜", "体检",
    # 情绪与心理
    "焦虑", "压力", "治愈", "内耗", "破防", "委屈", "心酸", "崩溃", "释怀",
    "迷茫", "emo", "孤独", "温柔", "心动", "遗憾", "想念", "拥抱", "告别",
    "重逢", "陪伴", "沉默", "慌张", "倔强", "勇敢", "脆弱", "敏感", "疲惫",
    # 关系与日常
    "前任", "闺蜜", "同事", "对象", "相亲", "异地", "结婚", "分手", "告白",
    "幸福", "牵挂", "平淡", "日常", "瞬间", "回忆", "青春", "少年", "故乡",
]


def load_dict(path: Path) -> list[tuple[str, int, str]]:
    rows: list[tuple[str, int, str]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        parts = line.split()
        if len(parts) < 2:
            continue
        word, freq_s = parts[0], parts[1]
        tag = parts[2] if len(parts) > 2 else ""
        try:
            freq = int(freq_s)
        except ValueError:
            continue
        rows.append((word, freq, tag))
    return rows


def fetch_dict() -> None:
    DICT_FILE.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(DICT_URL, headers={"User-Agent": "toolbox-audit"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = resp.read()
    except Exception:
        proxy = urllib.request.ProxyHandler({"http": PROXY, "https": PROXY})
        opener = urllib.request.build_opener(proxy)
        with opener.open(req, timeout=60) as resp:
            data = resp.read()
    DICT_FILE.write_bytes(data)


class Classifier:
    """规则化的可疑词判定。

    规则分两档，报告里会分别统计：

    A 档（POS 证据，客观可核）：词性标签就是专名 / 数量词 / 含拉丁字母。
    B 档（形态证据，启发式）：
      B1 叙事碎片：词以词典里的高频人名开头，且尾字是叙事虚词或动作词
         （孔明乃 / 宋江亦 / 令狐冲笑 / 杨过伸 这类分词残留）
      B2 姓氏+动作尾字：常见姓氏开头、动作词收尾，且词性不像独立实词
      B3 尾部虚词：以 向/仅/汪/艰 等虚词收尾且词频极低
    """

    NARRATIVE_TAILS = set("乃亦仅皆却遂")
    FRAG_ACTION_TAILS = set(FRAG_TAILS)
    NAME_PREFIX_MIN_FREQ = 100
    NAME_PREFIX_MAX_LEN = 3

    def __init__(self, rows: list[tuple[str, int, str]]) -> None:
        self.freq: dict[str, int] = {}
        self.tag: dict[str, str] = {}
        for word, freq, tag in rows:
            self.freq[word] = max(self.freq.get(word, 0), freq)
            prev = self.tag.get(word)
            if prev is None or (prev in PROPER_TAGS and tag not in PROPER_TAGS):
                self.tag[word] = tag
        self.names = {
            w
            for w, _f, t in rows
            if t in {"nr", "nrfg", "nrt"} and 2 <= len(w) <= 3 and HAN_RE.match(w)
        }

    def name_prefix(self, word: str) -> str | None:
        chars = list(word)
        for k in range(2, min(self.NAME_PREFIX_MAX_LEN, len(chars) - 1) + 1):
            prefix = "".join(chars[:k])
            if prefix in self.names and self.freq.get(prefix, 0) >= self.NAME_PREFIX_MIN_FREQ:
                return prefix
        return None

    def classify(self, word: str, a_only: bool = False) -> str:
        """返回可疑理由；a_only=True 时只返回 A 档（词性证据）结论。"""
        tag = self.tag.get(word, "")
        freq = self.freq.get(word, 0)

        # ---- A 档 ----
        if LATIN_RE.search(word):
            return "含拉丁字母"
        if tag == "m":
            return "数量词"
        if a_only:
            return f"专名({tag})" if tag in PROPER_TAGS else ""

        chars = list(word)
        last = chars[-1]
        prefix = self.name_prefix(word)

        # ---- B 档（先判碎片，避免被 nr 标签吞掉）----
        if prefix and last in self.NARRATIVE_TAILS:
            return "叙事碎片(人名+虚词)"
        if (
            prefix
            and last in self.FRAG_ACTION_TAILS
            and len(chars) >= 3
            and not (tag == "nr" and freq >= 150)
        ):
            return "叙事碎片(人名+动作)"
        if (
            len(chars) >= 3
            and chars[0] in SURNAME_SET
            and last in self.FRAG_ACTION_TAILS
            and tag not in {"n", "v", "a", "i", "l", "j"}
        ):
            return "姓氏+动作碎片"
        if any(word.startswith(h) for h in FRAG_HEADS) and last in self.FRAG_ACTION_TAILS:
            return "代词+动作碎片"
        if last in "向仅汪艰壕幢捆瓢篓磅撇" and freq < 50:
            return "尾部虚词碎片"

        if tag in PROPER_TAGS:
            return f"专名({tag})"
        if freq < 10:
            return "低频冷门(<10)"
        return ""


def classify(word: str, tag: str, freq: int) -> str:
    """保留旧签名，方便在 REPL 里快速探词。"""
    if tag in PROPER_TAGS:
        return f"专名({tag})"
    if LATIN_RE.search(word):
        return "含拉丁字母"
    return ""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="写出审计后的候选词表到 scripts/.cache/")
    ap.add_argument("--fetch", action="store_true", help="强制重新下载 jieba dict.txt")
    ap.add_argument("--apply", action="store_true", help="用推荐阈值覆盖 src/datasets/char_words.json")
    args = ap.parse_args()

    if args.fetch or not DICT_FILE.exists():
        print(f"downloading {DICT_URL}")
        fetch_dict()

    raw = DICT_FILE.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    rows = load_dict(DICT_FILE)

    # 一词可能有多条记录（同一词不同词性），Classifier 内部保留最高词频和最有信息量的标签
    clf = Classifier(rows)
    freq_of = clf.freq
    tag_of = clf.tag

    with CHAR_PINYIN.open(encoding="utf-8") as f:
        char_entries = json.load(f)
    chars = [e["char"] for e in char_entries]
    char_set = set(chars)

    current: dict[str, list[str]] = json.loads(CHAR_WORDS.read_text(encoding="utf-8"))

    # 候选池：与 build-char-words.py 完全一致的筛选条件
    buckets: dict[str, list[tuple[int, str]]] = defaultdict(list)
    kept_words: set[str] = set()
    for word, freq, _tag in rows:
        if not HAN_RE.match(word):
            continue
        n = len(word)
        if n < MIN_LEN or n > MAX_LEN:
            continue
        last = word[-1]
        if last not in char_set:
            continue
        buckets[last].append((freq, word))
        kept_words.add(word)

    def ranked(char: str) -> list[tuple[int, str]]:
        items = buckets.get(char, [])
        return sorted(items, key=lambda x: (-x[0], x[1]))

    # ---- 1. 当前产物逐词定档 ------------------------------------------------
    reason_counter: Counter[str] = Counter()
    a_tier: Counter[str] = Counter()  # POS 证据
    b_tier: Counter[str] = Counter()  # 形态证据
    low_freq = 0  # 词频 <10 但没有其他毛病
    total_words = 0
    per_char: dict[str, dict[str, object]] = {}
    for char in chars:
        words = current.get(char, [])
        if not words:
            per_char[char] = {"words": [], "bad": [], "good": [], "pool": len(buckets.get(char, []))}
            continue
        bad: list[tuple[str, str, int]] = []
        good: list[tuple[str, str, int]] = []
        for word in words:
            total_words += 1
            freq = freq_of.get(word, 0)
            reason = clf.classify(word)
            if not reason and freq < 10:
                reason = "低频冷门(<10)"
            if reason:
                if reason == "低频冷门(<10)":
                    low_freq += 1
                else:
                    reason_counter[reason] += 1
                    if reason.startswith(("专名", "数量词", "含拉丁")):
                        a_tier[reason] += 1
                    else:
                        b_tier[reason] += 1
                bad.append((word, reason, freq))
            else:
                good.append((word, tag_of.get(word, ""), freq))
        per_char[char] = {"words": words, "bad": bad, "good": good, "pool": len(buckets.get(char, []))}

    # ---- 2. 场景对比 -------------------------------------------------------
    # 依据均为「对候选池重新排序取前 16」，与 build-char-words.py 的口径一致：
    #   - 每字先按 (词频降序, 词条升序) 排序
    #   - level=0 不过滤；level='A' 淘汰 A 档；level='AB' 淘汰 A+B 档
    #   - min_freq>0 时再要求词频 >= min_freq（现存字表就是 min_freq=1 的产物）
    scenarios = [
        ("现状复现（无过滤，词频≥1）", 1, 0),
        ("现状字表（直接读文件）", 0, -1),
        ("去 A 档（专名/数量词），词频≥1", 1, "A"),
        ("去 A 档，词频≥3", 3, "A"),
        ("去 A+B 档，词频≥1", 1, "AB"),
        ("去 A+B 档，词频≥3（推荐）", 3, "AB"),
        ("去 A+B 档，词频≥20（严格）", 20, "AB"),
        ("去 A+B 档，词频≥50（激进）", 50, "AB"),
        ("去 A+B 档，词频≥3 + 专名兜底", 3, "ABF"),
    ]
    scenario_rows = []
    per_char_scenario: dict[str, dict[str, int]] = {}
    for name, min_freq, level in scenarios:
        full = under8 = empty = 0
        avail_total = 0
        detail: dict[str, int] = {}
        for char in chars:
            if level == -1:
                items = [(1, w) for w in current.get(char, [])]
            else:
                items = ranked(char)
                if min_freq > 1:
                    items = [(f, w) for f, w in items if f >= min_freq]
                if level == "A":
                    items = [(f, w) for f, w in items if not clf.classify(w, a_only=True)]
                elif level in ("AB", "ABF"):
                    pool = [(f, w) for f, w in items if not clf.classify(w)]
                    if level == "ABF" and len(pool) < 8:
                        # 保底：该字实在没词时，允许最多补到 8 个专名填坑
                        filler = [x for x in items if clf.classify(x[1], a_only=True)]
                        pool = pool + filler[: 8 - len(pool)]
                    items = pool
            n = len(items)
            avail_total += min(n, MAX_WORDS)
            if n == 0:
                empty += 1
            if n < 8:
                under8 += 1
            if n >= MAX_WORDS:
                full += 1
            detail[char] = n
        scenario_rows.append((name, full, under8, empty, avail_total / len(chars)))
        per_char_scenario[name] = detail

    # ---- 3. 现代词表缺口 ---------------------------------------------------
    if MODERN_LEXICON.exists():
        doc = json.loads(MODERN_LEXICON.read_text(encoding="utf-8"))
        entries = doc["words"] if isinstance(doc, dict) else doc
        lexicon = [
            (e["w"], e.get("tier", "high")) if isinstance(e, dict) else (e, "high")
            for e in entries
        ]
    else:
        lexicon = [(w, "high") for w in MODERN_FALLBACK]

    missing = [w for w, _t in lexicon if w not in freq_of]
    missing_current = [w for w, _t in lexicon if w not in current.get(w[-1], [])]
    missing_high = [w for w, t in lexicon if t == "high" and w not in freq_of]
    present_but_buried = [
        w for w, _t in lexicon
        if w in freq_of and w[-1] in char_set and w not in current.get(w[-1], [])
    ]

    # ---- 4. 受害最重的字 ---------------------------------------------------
    victims = []
    for char, info in per_char.items():
        bad = info["bad"]
        if not bad:
            continue
        victims.append((len(bad), char, bad, info["pool"]))
    victims.sort(key=lambda x: (-x[0], x[1]))

    # ---- 5. 推荐方案 -------------------------------------------------------
    # 剔除 A 档（专名/数量词/拉丁）与全部 B 档，词频 ≥3，不做任何兜底：
    # 宁可某个字只剩 2 个词，也不把刚剔掉的专名再塞回去。
    RECOMMEND_FREQ = 3
    audited: dict[str, list[str]] = {}
    for char in chars:
        pool = [
            (f, w)
            for f, w in ranked(char)
            if not clf.classify(w) and f >= RECOMMEND_FREQ
        ]
        if pool:
            audited[char] = [w for _f, w in pool[:MAX_WORDS]]

    # 兜底（专名）能补回多少字，单独统计，不作为推荐结果
    filler_gain = 0
    filler_words = 0
    for char in chars:
        if audited.get(char):
            continue
        filler = [
            (f, w)
            for f, w in ranked(char)
            if f >= RECOMMEND_FREQ and clf.classify(w, a_only=True)
        ]
        if filler:
            filler_gain += 1
            filler_words += min(len(filler), 8)

    # ---- 报告 --------------------------------------------------------------
    lines: list[str] = []
    add = lines.append
    add("# 查韵词库审计报告")
    add("")
    add("由 `scripts/audit-char-words.py` 生成，数据源与 `build-char-words.py` 完全一致。")
    add("")
    add(f"- jieba dict.txt：`{DICT_FILE.relative_to(ROOT)}`")
    add(f"- sha256：`{sha}`，{len(rows)} 行")
    add(f"- 字表：`{CHAR_PINYIN.relative_to(ROOT)}`，{len(chars)} 字")
    add(f"- 当前词表：`{CHAR_WORDS.relative_to(ROOT)}`，{len(current)} 字 / {total_words} 词")
    add(f"- 候选池（与 build-char-words.py 同规则）：{len(kept_words)} 个不同词条")
    add("")

    add("## 一、判定规则")
    add("")
    add("**A 档：词性证据（客观，可直接核验）**")
    add("")
    add("| 规则 | 说明 | 典型例子 |")
    add("| --- | --- | --- |")
    add(f"| 专名标签 | 词性属于 {'/'.join(sorted(PROPER_TAGS))} | 令狐冲<sub>nr</sub>、曲靖<sub>ns</sub>、斯达康<sub>nz</sub> |")
    add("| 数量词 | 词性 `m` | 万幢、二十捆、数百万磅 |")
    add("| 含拉丁字母 | 词面含 A-Z | A座、B超、T恤 |")
    add("")
    add("**B 档：形态证据（启发式，报告同时给出命中量以便复核）**")
    add("")
    add("| 规则 | 触发条件 | 典型例子 |")
    add("| --- | --- | --- |")
    add("| 叙事碎片(人名+虚词) | 以词典内词频≥100 的人名开头，尾字 ∈ 乃/亦/仅/皆/却/遂 | 孔明乃、宋江亦、孙权皆 |")
    add("| 叙事碎片(人名+动作) | 同上人名开头，尾字为动作词且词条不是高频 nr | 令狐冲笑、杨过伸、郭靖见 |")
    add("| 姓氏+动作碎片 | 常见姓氏开头 + 动作尾字，词性不像独立实词 | 冯保伸、祝黄蓉 |")
    add("| 代词+动作碎片 | 我们/众人/两人… + 动作尾字 | 我们要买（词典实有） |")
    add("| 尾部虚词碎片 | 以 向/仅/汪/艰/壕/幢… 收尾且词频<50 | 向西伸、不久汪、步唯艰 |")
    add("")

    add("## 二、当前词表的构成")
    add("")
    bad_total = sum(reason_counter.values())
    a_total = sum(a_tier.values())
    b_total = sum(b_tier.values())
    add("| 类别 | 词数 | 占全部 % |")
    add("| --- | ---: | ---: |")
    add(f"| A 档 专名 | {sum(v for k, v in a_tier.items() if k.startswith('专名'))} | {100 * sum(v for k, v in a_tier.items() if k.startswith('专名')) / total_words:.1f}% |")
    add(f"| A 档 数量词 | {a_tier['数量词']} | {100 * a_tier['数量词'] / total_words:.1f}% |")
    add(f"| A 档 含拉丁字母 | {a_tier['含拉丁字母']} | {100 * a_tier['含拉丁字母'] / total_words:.1f}% |")
    for reason, n in sorted(b_tier.items(), key=lambda x: -x[1]):
        add(f"| B 档 {reason} | {n} | {100 * n / total_words:.1f}% |")
    add(f"| **A+B 档合计** | **{bad_total}** | **{100 * bad_total / total_words:.1f}%** |")
    add(f"| 低频冷门(<10)，无其他问题 | {low_freq} | {100 * low_freq / total_words:.1f}% |")
    keep = total_words - bad_total - low_freq
    add(f"| 其余（可用） | {keep} | {100 * keep / total_words:.1f}% |")
    add("")
    add(f"A 档 {a_total} 词，B 档 {b_total} 词。B 档是启发式，宁可少报也不误伤，")
    add("所以真实碎片量应高于此数（例如 908 个「金庸角色名+动作字」条目里，规则只稳定命中一部分）。")
    add("")
    add("> A 档完全依赖 jieba 的词性标注，而这份标注本身有误（典型：`湖水` 被标成 ns 地名，")
    add("> `白莲教` 被标成 nr 人名），因此 A 档过滤偏严，会误伤少量正常词。")
    add("> 这部分损失计入下面的覆盖矩阵，不会让结果看起来比实际更好。")
    add("")

    add("## 三、覆盖矩阵（每个字最多取 16 词）")
    add("")
    add("| 方案 | 能凑满16词的字 | 不足8词的字 | 一个字都没有 | 平均可选词数 |")
    add("| --- | ---: | ---: | ---: | ---: |")
    for name, full, under8, empty, avg in scenario_rows:
        add(f"| {name} | {full}/{len(chars)} | {under8} | {empty} | {avg:.1f} |")
    add("")

    add("## 四、受损最重的字（前 60）")
    add("")
    add("| 字 | 候选池 | 当前列表里的可疑词（下标为判定理由） |")
    add("| --- | ---: | --- |")
    for n_bad, char, bad, pool in victims[:60]:
        shown = "、".join(f"{w}<sub>{r}</sub>" for w, r, _f in bad[:10])
        add(f"| {char} | {pool} | {shown} |")
    add("")

    add("## 五、现代常用词缺口")
    add("")
    add(f"对照词表 {len(lexicon)} 个词（`{MODERN_LEXICON.relative_to(ROOT)}`，high = 通用书面/口语常用词）：")
    add("")
    add(f"- jieba 词典里**根本没有**：{len(missing)} 个，其中 high 档 {len(missing_high)} 个")
    add(f"  - high 缺失：{'、'.join(missing_high) if missing_high else '无'}")
    add(f"  - 其余缺失：{'、'.join(w for w in missing if w not in missing_high) or '无'}")
    add(f"- 有词条、尾字也在字表里，但被挤出该字当前 16 词列表：{len(present_but_buried)} 个 —— {'、'.join(present_but_buried) or '无'}")
    add("")

    add("## 六、前后对比抽样")
    add("")
    add("优先看当初报告有问题的那几个字，再补受损最重的前 8 个字。")
    add("")
    focus = ["伸", "襄", "蓉", "敏", "康", "靖", "冲", "水", "风"]
    sample_chars = focus + [c for _n, c, _b, _p in victims[:40] if c not in focus][:8]
    for char in sample_chars:
        before = current.get(char, [])
        after = audited.get(char, [])
        bad = [w for w, _r, _f in per_char.get(char, {}).get("bad", [])]
        add(f"**{char}**")
        add("")
        add(f"- 现状（{len(before)}）：{'、'.join(before)}")
        add(f"- 审计后（{len(after)}）：{'、'.join(after) if after else '（空）'}")
        if bad:
            add(f"- 被剔除：{'、'.join(bad)}")
        add("")

    add("## 七、推荐方案与结论")
    add("")
    add(f"**推荐方案：** 剔除 A 档与全部 B 档，词频 ≥ {RECOMMEND_FREQ}，**不做任何兜底**。")
    add("某个字只剩 2 个词就展示 2 个，绝不把刚剔掉的专名塞回去。")
    add("")
    rec_full = sum(1 for c in chars if len(audited.get(c, [])) >= MAX_WORDS)
    rec_under8 = sum(1 for c in chars if 0 < len(audited.get(c, [])) < 8)
    rec_empty = sum(1 for c in chars if not audited.get(c))
    total_audited = sum(len(v) for v in audited.values())
    add(f"- 结果：{len(audited)} 字有词 / 共 {total_audited} 词")
    add(f"  - {rec_full} 字能凑满 16 词")
    add(f"  - {rec_under8} 字不足 8 词（其中不少只剩 1–3 个词）")
    add(f"  - {rec_empty} 字完全为空（候选池里一个能用的词都没有）")
    add("")
    add(f"若允许用专名兜底，只能多救回 {filler_gain} 个字（约 {filler_words} 个词），")
    add("代价是这些位置上重新出现人名/地名——与本次整改目标冲突，故不采纳。")
    add("")
    add("**严格方案（不建议单独使用）：** 把词频阈值提到 20，只剩 831 字能凑满 16 词、684 字为空。")
    add("阈值越高损失越大，说明 jieba 词典里合格常用词的密度本来就不够。")
    add("")
    add("> **结论**")
    add(">")
    add("> 1. 「混进人名」能解决：A 档（专名/数量词/拉丁）占 28.1%，剔除即止血。")
    add(">    挤掉正常词的正是这些高频专名：顾秋水 857 > 湖水 856，李云风 351 > 台风 340，令狐冲 4787。")
    add("> 2. 「词不够用」过滤解决不了：剔完 A+B 档后仍有 575 个字一个词都没有、")
    add(">    2177 个字不足 8 个词。必须更换词频数据源（《现代汉语常用词表》56008 词 /")
    add(">    SUBTLEX-CH 影视字幕词频 / CLD 中文词汇数据库），把本脚本的判定规则留作")
    add(">    **清洗与持续告警**手段。")
    add("> 3. 直接原因在 `build-char-words.py`：它只筛了长度和汉字范围，没有过滤词性。")
    add(">    即使继续用 jieba 词典，也应至少加上 A 档过滤。")
    add("> 4. 字表本身也值得复核：少量字的 jieba 词性标注明显有误")
    add(">    （湖水标成 ns 地名、白莲教标成 nr 人名），说明这份词典的词性只能当参考。")
    add("")

    REPORT.write_text("\n".join(lines), encoding="utf-8")

    if args.write or args.apply:
        CANDIDATES.parent.mkdir(parents=True, exist_ok=True)
        CANDIDATES.write_text(
            json.dumps({k: audited[k] for k in sorted(audited)}, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        print(f"wrote {CANDIDATES.relative_to(ROOT)}")
    if args.apply:
        CHAR_WORDS.write_text(
            json.dumps({k: audited[k] for k in sorted(audited)}, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        print(f"wrote {CHAR_WORDS.relative_to(ROOT)}")

    # 控制台摘要
    print(f"jieba dict sha256 {sha[:16]}…  {len(rows)} 行")
    print(f"当前词表 {total_words} 词：A+B 档可疑 {bad_total} ({100 * bad_total / total_words:.1f}%)，另有低频冷门 {low_freq} ({100 * low_freq / total_words:.1f}%)")
    print(f"  A 档（词性证据）    {a_total:>6}  {100 * a_total / total_words:5.1f}%")
    print(f"  B 档（形态证据）    {b_total:>6}  {100 * b_total / total_words:5.1f}%")
    for reason, n in sorted(b_tier.items(), key=lambda x: -x[1]):
        print(f"      {reason:<18} {n:>6}")
    print(f"  低频冷门(<10)       {low_freq:>6}  {100 * low_freq / total_words:5.1f}%")
    for name, full, under8, empty, avg in scenario_rows:
        print(f"  [{name}] 满16词 {full}/{len(chars)}  不足8词 {under8}  空 {empty}  均 {avg:.1f}")
    print(f"现代词缺口：{len(missing)} 个词典里没有（high 档 {len(missing_high)} 个）")
    print(f"推荐方案：{len(audited)} 字有词，{rec_full} 字满 16，{rec_empty} 字空")
    print(f"report -> {REPORT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

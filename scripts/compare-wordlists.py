#!/usr/bin/env python3
"""Side-by-side quality report: 旧词表(jieba) vs 新词表(常用词表+SUBTLEX-CH).

Reproduces the judgment rules from scripts/audit-char-words.py and applies them to
both word lists, so the comparison uses one yardstick:

  A 档 专名/数量词/含拉丁    — jieba 词性标签证据
  B 档 分词碎片              — 人名+动作/虚词、姓氏+动作、尾部虚词
  C 档 低频冷门              — jieba 词频 < 10

Usage:
    python3 scripts/compare-wordlists.py                       # 旧词表 vs scripts/.cache/char_words_new.json
    python3 scripts/compare-wordlists.py --new src/datasets/char_words.json
"""

from __future__ import annotations

import argparse
import importlib.util
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JIEBA = ROOT / "scripts" / ".cache" / "jieba-dict.txt"
CHAR_PINYIN = ROOT / "src" / "datasets" / "char_pinyin.json"
OLD = ROOT / "src" / "datasets" / "char_words.json"
NEW = ROOT / "scripts" / ".cache" / "char_words_new.json"

FOCUS = ["伸", "襄", "蓉", "敏", "康", "靖", "冲", "水", "风", "唱", "微", "念", "泪", "梦"]


def load_audit_module():
    spec = importlib.util.spec_from_file_location(
        "audit_char_words", ROOT / "scripts" / "audit-char-words.py"
    )
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


# jieba 的词性标注本身经常出错（过敏、灵敏 被标成 nr 人名），
# 所以判断新词表时不能用 jieba 标签，改用「有没有权威词表背书」。
SURNAMES = set(
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


def grade_v2(word: str, entry: dict | None, clf, audit) -> str:
    """面向新词表的判定：只有「无权威词表背书 + 像人名」才叫可疑。"""
    if entry is None:
        entry = {}
    in_modern = "m" in entry
    has_subtitle = "s" in entry
    count = entry.get("s", 0)
    cd = entry.get("cd", 0)

    if has_subtitle and not in_modern:
        # 仅字幕来源：人名/品牌特征是高词频、低影片覆盖，或首字是常见姓氏
        if len(word) <= 3 and cd < 120 and count > 0:
            return "仅字幕·低覆盖(疑似专名)"
        if word[0] in SURNAMES and len(word) in (2, 3) and cd < 400:
            return "仅字幕·姓氏开头(疑似人名)"
    if not in_modern and not has_subtitle:
        return "仅 jieba 兜底"
    return "可用"


def grade_legacy(clf, audit, word: str) -> str:
    reason = clf.classify(word)
    if reason:
        return f"A/B 档可疑:{reason}"
    if clf.freq.get(word, 0) < 10:
        return "低频冷门(<10)"
    return "可用"


def report_legacy(name: str, table: dict[str, list[str]], clf) -> None:
    stats: Counter[str] = Counter()
    for words in table.values():
        for word in words:
            stats[grade_legacy(clf, None, word)] += 1
    n = sum(stats.values())
    print(f"\n### {name}（旧口径：jieba 词性 + 词频）")
    print(f"  字数 {len(table)}  词数 {n}")
    for k, v in stats.most_common(6):
        print(f"  {k:<28} {v:>6}  {100 * v / n:5.1f}%")


def report_new(name: str, table: dict[str, list[str]], wf: dict[str, dict]) -> None:
    stats: Counter[str] = Counter()
    for words in table.values():
        for word in words:
            stats[grade_v2(word, wf.get(word), None, None)] += 1
    n = sum(stats.values())
    full = sum(1 for v in table.values() if len(v) >= 16)
    under8 = sum(1 for v in table.values() if len(v) < 8)
    print(f"\n### {name}（新口径：以权威词表背书为准）")
    print(f"  字数 {len(table)}  词数 {n}  满16词 {full}  不足8词 {under8}")
    for k, v in stats.most_common():
        print(f"  {k:<28} {v:>6}  {100 * v / n:5.1f}%")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--new", default=str(NEW))
    ap.add_argument("--old", default=str(OLD))
    args = ap.parse_args()

    audit = load_audit_module()
    clf = audit.Classifier(audit.load_dict(JIEBA))
    old = json.loads(Path(args.old).read_text(encoding="utf-8"))
    new = json.loads(Path(args.new).read_text(encoding="utf-8"))
    chars = [e["char"] for e in json.loads(CHAR_PINYIN.read_text(encoding="utf-8"))]
    wf = json.loads((ROOT / "scripts" / ".cache" / "wordfreq.json").read_text(encoding="utf-8"))

    print("# 词表质量对比")
    def label(path: str) -> str:
        p = Path(path)
        try:
            return str(p.relative_to(ROOT))
        except ValueError:
            return str(p)

    print(f"旧: {label(args.old)}")
    print(f"新: {label(args.new)}")
    report_legacy("旧词表（jieba）", old, clf)
    report_new("新词表（常用词表 + SUBTLEX-CH + 干净 jieba 兜底）", new, wf)

    print("\n## 重点字对比")
    for char in FOCUS:
        o = old.get(char, [])
        n = new.get(char, [])
        if not o and not n:
            continue
        print(f"\n**{char}**")
        print(f"- 旧（{len(o)}）：{'、'.join(o)}")
        print(f"- 新（{len(n)}）：{'、'.join(n)}")

    print("\n## 新词表里判定仍可疑的条目（全部）")
    flagged = []
    for char in chars:
        for word in new.get(char, []):
            verdict = grade_v2(word, wf.get(word), None, None)
            if verdict != "可用":
                flagged.append((char, word, verdict))
    for char, word, verdict in flagged[:40]:
        print(f"  {char} -> {word}  [{verdict}]")
    print(f"  合计 {len(flagged)} 个（{100 * len(flagged) / max(sum(len(v) for v in new.values()), 1):.1f}%）")

    print("\n## 空字与稀疏字")
    empty = [c for c in chars if not new.get(c)]
    thin = [(c, len(new[c])) for c in chars if 0 < len(new.get(c, [])) < 8]
    print(f"  新词表空字 {len(empty)} 个：{''.join(empty[:100])}")
    print(f"  新词表不足 8 词 {len(thin)} 个：{'、'.join(f'{c}({n})' for c, n in thin[:40])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

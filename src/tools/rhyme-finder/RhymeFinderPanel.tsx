import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, ClipboardCopy } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import charPinyinData from "@/datasets/char_pinyin.json";
import charWordsData from "@/datasets/char_words.json";
import rhymeGroupsData from "@/datasets/rhyme-groups.json";

interface CharEntry {
  char: string;
  pinyin: string[];
  pinyin_plain: string[];
}

interface RhymeGroup {
  label: string;
  pinyin: string[];
}

const data = charPinyinData as CharEntry[];
const rhymeGroups = rhymeGroupsData as RhymeGroup[];
const charWords = charWordsData as Record<string, string[]>;

export function RhymeFinderPanel() {
  const [selected, setSelected] = useState<string | null>(null);
  const [pickedWords, setPickedWords] = useState<string[]>([]);
  const [activeChar, setActiveChar] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [rhymeCollapsed, setRhymeCollapsed] = useState(false);

  const pickedSet = useMemo(() => new Set(pickedWords), [pickedWords]);

  // 每个韵部对应的字数统计
  const { allGroups, counts } = useMemo(() => {
    // 为每个韵部建立拼音集合以快速查找
    const groupPinyinSets = rhymeGroups.map((g) => new Set(g.pinyin));
    const map = new Map<string, number>();
    for (let i = 0; i < rhymeGroups.length; i++) {
      const pinyinSet = groupPinyinSets[i];
      let count = 0;
      for (const entry of data) {
        if (entry.pinyin_plain.some((p) => pinyinSet.has(p))) {
          count++;
        }
      }
      map.set(rhymeGroups[i].label, count);
    }
    return { allGroups: rhymeGroups.map((g) => g.label), counts: map };
  }, []);

  const filtered = useMemo(() => {
    if (!selected) return [] as CharEntry[];
    const group = rhymeGroups.find((g) => g.label === selected);
    if (!group) return [] as CharEntry[];
    const pinyinPool = new Set(group.pinyin);
    return data.filter((e) => e.pinyin_plain.some((p) => pinyinPool.has(p)));
  }, [selected]);

  const dialogWords = activeChar
    ? [activeChar, ...(charWords[activeChar] ?? [])]
    : [];

  const activeIndex = activeChar
    ? filtered.findIndex((e) => e.char === activeChar)
    : -1;

  useEffect(() => {
    if (!activeChar) return;
    document
      .getElementById(`rhyme-char-${activeChar}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeChar]);

  const goToAdjacent = (delta: number) => {
    const entry = filtered[activeIndex + delta];
    if (entry) setActiveChar(entry.char);
  };

  const selectGroup = (label: string) => {
    setSelected((prev) => (prev === label ? null : label));
    setPickedWords([]);
    setActiveChar(null);
  };

  const toggleWord = (word: string) => {
    setPickedWords((prev) => {
      if (prev.includes(word)) return prev.filter((w) => w !== word);
      return [...prev, word];
    });
  };

  const copyPicked = () => {
    if (pickedWords.length === 0) return;
    navigator.clipboard.writeText(pickedWords.join(" ")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="flex h-full flex-col gap-2 p-2 sm:gap-4 sm:p-4 md:p-6">
      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader className="px-3 py-2 sm:px-6 sm:py-4">
          <CardTitle className="text-base sm:text-lg">查韵</CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            选择韵部查看对应的常用汉字
          </CardDescription>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-3 px-3 sm:gap-4 sm:px-6 md:flex-row">
          {/* 左侧：韵部列表 */}
          <aside className={cn(
            "flex w-full shrink-0 flex-col gap-1.5 border-b pb-3 sm:gap-2 sm:pb-4 md:w-64 md:border-b-0 md:border-r md:pr-4 md:pb-0",
            rhymeCollapsed && "pb-1 sm:pb-2"
          )}>
            <button
              type="button"
              onClick={() => setRhymeCollapsed((v) => !v)}
              className="flex items-center gap-1 text-[11px] sm:text-xs text-muted-foreground md:pointer-events-none"
            >
              {rhymeCollapsed
                ? <ChevronDown className="size-3.5 md:hidden" />
                : <ChevronUp className="size-3.5 md:hidden" />}
              <span>韵部</span>
            </button>
            <div className={cn(
              "max-h-36 flex-1 overflow-y-auto pr-1 sm:max-h-48 md:max-h-none",
              rhymeCollapsed && "hidden md:block"
            )}>
              <div className="grid grid-cols-3 gap-1 sm:gap-1.5">
                {allGroups.map((label) => {
                  const active = selected === label;
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => selectGroup(label)}
                      className={cn(
                        "flex items-center justify-between gap-0.5 rounded-md border py-1 px-1.5 text-xs sm:gap-1 sm:py-1.5 sm:px-2 sm:text-sm transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-background hover:bg-accent hover:text-accent-foreground",
                      )}
                    >
                      <span className="font-mono">{label}</span>
                      <span
                        className={cn(
                          "text-[10px] sm:text-xs",
                          active ? "opacity-80" : "text-muted-foreground",
                        )}
                      >
                        {counts.get(label) ?? 0}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          {/* 右侧：匹配的汉字 */}
          <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5 sm:gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs sm:text-sm text-muted-foreground">
                {!selected
                  ? "请先选择韵部"
                  : pickedWords.length > 0
                  ? `已选 ${pickedWords.length} 词 / 共 ${filtered.length} 字`
                  : `${filtered.length} 字，点击选词`}
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={pickedWords.length === 0}
                onClick={copyPicked}
                className="shrink-0 h-7 px-2 text-xs sm:h-8 sm:px-3 sm:text-sm"
              >
                {copied ? <Check className="text-green-500 size-3.5 sm:size-4" /> : <ClipboardCopy className="size-3.5 sm:size-4" />}
                {copied ? "已复制" : "复制"}
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto rounded-md border p-2 sm:p-3">
              {filtered.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  暂无内容
                </div>
              ) : (
                <div className="flex flex-wrap gap-1 sm:gap-2">
                  {filtered.map((e) => {
                    const isPicked = pickedWords.some((w) => w.endsWith(e.char));
                    const isActive = e.char === activeChar;
                    return (
                      <button
                        key={e.char}
                        id={`rhyme-char-${e.char}`}
                        type="button"
                        title={e.pinyin.join(" / ")}
                        onClick={() => setActiveChar(e.char)}
                        className={cn(
                          "flex min-w-[2rem] sm:min-w-[2.25rem] items-center justify-center rounded-md border px-1.5 py-0.5 sm:px-2 sm:py-1 text-center transition-colors",
                          isPicked
                            ? "border-primary bg-primary text-primary-foreground"
                            : "bg-card hover:bg-accent hover:text-accent-foreground",
                          isActive && "ring-2 ring-offset-2 ring-primary ring-offset-background",
                        )}
                      >
                        <span className="text-base sm:text-lg leading-tight">{e.char}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </CardContent>
      </Card>

      {activeChar && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pb-4 pt-[12vh]"
          onClick={() => setActiveChar(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="word-picker-title"
            className="flex max-h-[min(calc(88vh-1rem),640px)] w-full max-w-sm flex-col rounded-xl border bg-card shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
              <Button
                size="sm"
                variant="outline"
                disabled={activeIndex <= 0}
                onClick={() => goToAdjacent(-1)}
                className="h-7 shrink-0 px-2 text-xs"
              >
                前一个字
              </Button>
              <h2 id="word-picker-title" className="text-lg font-semibold leading-none">
                {activeChar}
                {activeIndex >= 0 && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {activeIndex + 1}/{filtered.length}
                  </span>
                )}
              </h2>
              <Button
                size="sm"
                variant="outline"
                disabled={activeIndex < 0 || activeIndex >= filtered.length - 1}
                onClick={() => goToAdjacent(1)}
                className="h-7 shrink-0 px-2 text-xs"
              >
                后一个字
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                {dialogWords.map((word) => {
                  const isPicked = pickedSet.has(word);
                  return (
                    <button
                      key={word}
                      type="button"
                      onClick={() => toggleWord(word)}
                      className={cn(
                        "flex min-w-[2rem] items-center justify-center rounded-md border px-2 py-1 text-center transition-colors",
                        isPicked
                          ? "border-primary bg-primary text-primary-foreground"
                          : "bg-card hover:bg-accent hover:text-accent-foreground",
                      )}
                    >
                      <span className="text-base sm:text-lg leading-tight">{word}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

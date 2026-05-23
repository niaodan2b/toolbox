import { useMemo, useState } from "react";
import { Check, ClipboardCopy, Eraser } from "lucide-react";

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

export function RhymeFinderPanel() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pickedChars, setPickedChars] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

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

  // 根据所选韵部过滤汉字（OR 关系：任一韵部命中即可）
  const filtered = useMemo(() => {
    if (selected.size === 0) return [] as CharEntry[];
    // 汇总所有选中韵部的拼音到一个 Set
    const pinyinPool = new Set<string>();
    for (const group of rhymeGroups) {
      if (selected.has(group.label)) {
        for (const p of group.pinyin) {
          pinyinPool.add(p);
        }
      }
    }
    return data.filter((e) => e.pinyin_plain.some((p) => pinyinPool.has(p)));
  }, [selected]);

  const toggle = (label: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
    setPickedChars(new Set());
  };

  const clear = () => { setSelected(new Set()); setPickedChars(new Set()); };

  const toggleChar = (char: string) => {
    setPickedChars((prev) => {
      const next = new Set(prev);
      if (next.has(char)) next.delete(char);
      else next.add(char);
      return next;
    });
  };

  const copyPicked = () => {
    if (pickedChars.size === 0) return;
    // 按 filtered 顺序输出，保持原始排列
    const str = filtered
      .filter((e) => pickedChars.has(e.char))
      .map((e) => e.char)
      .join(" ");
    navigator.clipboard.writeText(str).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="flex h-full flex-col gap-4 p-4 md:p-6">
      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader>
          <CardTitle>查韵</CardTitle>
          <CardDescription>
            从左侧选择一个或多个韵部，右侧显示对应的常用汉字。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row">
          {/* 左侧：韵部列表 */}
          <aside className="flex w-full shrink-0 flex-col gap-2 border-b pb-4 md:w-64 md:border-b-0 md:border-r md:pr-4 md:pb-0">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                已选 {selected.size} / {allGroups.length} 个韵部
              </div>
              <Button size="sm" variant="ghost" onClick={clear} disabled={selected.size === 0}>
                <Eraser />
                清空
              </Button>
            </div>
            <div className="max-h-48 flex-1 overflow-y-auto pr-1 md:max-h-none">
              <div className="grid grid-cols-3 gap-1.5">
                {allGroups.map((label) => {
                  const active = selected.has(label);
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => toggle(label)}
                      className={cn(
                        "flex items-center justify-between gap-1 rounded-md border py-1.5 px-2 text-sm transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-background hover:bg-accent hover:text-accent-foreground",
                      )}
                    >
                      <span className="font-mono">{label}</span>
                      <span
                        className={cn(
                          "text-xs",
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
          <section className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm text-muted-foreground">
                {selected.size === 0
                  ? "请先在左侧选择韵部"
                  : pickedChars.size > 0
                  ? `已选 ${pickedChars.size} 个汉字 / 共 ${filtered.length} 个`
                  : `匹配 ${filtered.length} 个汉字，点击可选中`}
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={pickedChars.size === 0}
                onClick={copyPicked}
                className="shrink-0"
              >
                {copied ? <Check className="text-green-500" /> : <ClipboardCopy />}
                {copied ? "已复制" : "复制"}
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto rounded-md border p-3">
              {filtered.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  暂无内容
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {filtered.map((e) => {
                    const isPicked = pickedChars.has(e.char);
                    return (
                      <button
                        key={e.char}
                        type="button"
                        title={e.pinyin.join(" / ")}
                        onClick={() => toggleChar(e.char)}
                        className={cn(
                          "flex min-w-[3rem] flex-col items-center rounded-md border px-2 py-1 text-center transition-colors",
                          isPicked
                            ? "border-primary bg-primary text-primary-foreground"
                            : "bg-card hover:bg-accent hover:text-accent-foreground",
                        )}
                      >
                        <span className="text-lg leading-tight">{e.char}</span>
                        <span
                          className={cn(
                            "font-mono text-[10px]",
                            isPicked ? "opacity-80" : "text-muted-foreground",
                          )}
                        >
                          {e.pinyin.join("/")}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}

import { useMemo, useState } from "react";
import { Eraser, ListChecks } from "lucide-react";

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

interface CharEntry {
  char: string;
  pinyin: string[];
  yunmu: string[];
}

const data = charPinyinData as CharEntry[];

// 韵母按传统拼音教学顺序排列；未在此列表中的会按字母序追加到末尾
const YUNMU_ORDER = [
  "a", "o", "e", "ê", "i", "u", "ü",
  "ai", "ei", "ui", "ao", "ou", "iu", "ie", "üe", "er",
  "an", "en", "in", "un", "ün",
  "ang", "eng", "ing", "ong",
  "ia", "ua", "uo", "uai", "iao",
  "ian", "uan", "üan",
  "iang", "uang", "iong",
];

export function RhymeFinderPanel() {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // 韵母 -> 字数；同时收集所有出现过的韵母
  const { allYunmu, counts } = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of data) {
      for (const y of entry.yunmu) {
        map.set(y, (map.get(y) ?? 0) + 1);
      }
    }
    const list = Array.from(map.keys()).sort((a, b) => {
      const ia = YUNMU_ORDER.indexOf(a);
      const ib = YUNMU_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    return { allYunmu: list, counts: map };
  }, []);

  // 根据所选韵母过滤汉字（OR 关系：任一 yunmu 命中即可）
  const filtered = useMemo(() => {
    if (selected.size === 0) return [] as CharEntry[];
    return data.filter((e) => e.yunmu.some((y) => selected.has(y)));
  }, [selected]);

  const toggle = (y: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(y)) next.delete(y);
      else next.add(y);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(allYunmu));
  const clear = () => setSelected(new Set());

  return (
    <div className="flex h-full flex-col gap-4 p-4 md:p-6">
      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader>
          <CardTitle>查韵</CardTitle>
          <CardDescription>
            从左侧选择一个或多个韵母，右侧显示对应的常用汉字。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row">
          {/* 左侧：韵母列表 */}
          <aside className="flex w-full shrink-0 flex-col gap-2 border-b pb-4 md:w-60 md:border-b-0 md:border-r md:pr-4 md:pb-0">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={selectAll}>
                <ListChecks />
                全选
              </Button>
              <Button size="sm" variant="ghost" onClick={clear}>
                <Eraser />
                清空
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              已选 {selected.size} / {allYunmu.length} 个韵母
            </div>
            <div className="max-h-48 flex-1 overflow-y-auto pr-1 md:max-h-none">
              <div className="flex flex-wrap gap-1.5">
                {allYunmu.map((y) => {
                  const active = selected.has(y);
                  return (
                    <button
                      key={y}
                      type="button"
                      onClick={() => toggle(y)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-background hover:bg-accent hover:text-accent-foreground",
                      )}
                    >
                      <span className="font-mono">{y}</span>
                      <span
                        className={cn(
                          "text-xs",
                          active ? "opacity-80" : "text-muted-foreground",
                        )}
                      >
                        {counts.get(y) ?? 0}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          {/* 右侧：匹配的汉字 */}
          <section className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="text-sm text-muted-foreground">
              {selected.size === 0
                ? "请先在左侧选择韵母"
                : `匹配 ${filtered.length} 个汉字`}
            </div>
            <div className="flex-1 overflow-y-auto rounded-md border p-3">
              {filtered.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  暂无内容
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {filtered.map((e) => (
                    <div
                      key={e.char}
                      className="flex min-w-[3rem] flex-col items-center rounded-md border bg-card px-2 py-1 text-center"
                      title={e.pinyin.join(" / ")}
                    >
                      <span className="text-lg leading-tight">{e.char}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {e.pinyin.join("/")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}

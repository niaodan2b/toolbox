import { useMemo, useState, type CSSProperties } from "react";
import { Search, Wrench } from "lucide-react";

import { cn } from "@/lib/utils";
import { tools } from "@/tools/registry";
import type { ToolModule } from "@/tools/types";

interface SidebarProps {
  activeId: string | undefined;
  onSelect: (id: string) => void;
  /** 选中工具后的回调（例如关闭移动端抽屉） */
  onAfterSelect?: () => void;
  /** 额外类名（例如控制定位与宽度） */
  className?: string;
  /** 额外内联样式（例如安全区域内边距） */
  style?: CSSProperties;
}

function matchTool(tool: ToolModule, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (tool.name.toLowerCase().includes(q)) return true;
  if (tool.id.toLowerCase().includes(q)) return true;
  if (tool.description?.toLowerCase().includes(q)) return true;
  if (tool.keywords?.some((k) => k.toLowerCase().includes(q))) return true;
  return false;
}

export function Sidebar({
  activeId,
  onSelect,
  onAfterSelect,
  className,
  style,
}: SidebarProps) {
  const [query, setQuery] = useState("");

  const grouped = useMemo(() => {
    const filtered = tools.filter((t) => matchTool(t, query));
    const map = new Map<string, ToolModule[]>();
    for (const t of filtered) {
      const key = t.category ?? "其他";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return Array.from(map.entries());
  }, [query]);

  return (
    <aside
      className={cn(
        "bg-sidebar text-sidebar-foreground flex h-full w-full flex-col border-r",
        className,
      )}
      style={style}
    >
      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <Wrench className="size-5" />
        <span className="text-base font-semibold">工具箱</span>
      </div>

      <div className="p-3">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索工具..."
            className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-transparent py-2 pr-3 pl-8 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:ring-[3px]"
          />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {grouped.length === 0 ? (
          <div className="text-muted-foreground px-3 py-4 text-sm">
            未找到匹配的工具
          </div>
        ) : (
          grouped.map(([category, list]) => (
            <div key={category} className="mb-4">
              <div className="text-muted-foreground px-3 pt-2 pb-1 text-xs font-medium uppercase tracking-wider">
                {category}
              </div>
              <ul className="flex flex-col gap-0.5">
                {list.map((tool) => {
                  const Icon = tool.icon;
                  const isActive = tool.id === activeId;
                  return (
                    <li key={tool.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onSelect(tool.id);
                          onAfterSelect?.();
                        }}
                        className={cn(
                          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                          isActive &&
                            "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
                        )}
                      >
                        {Icon ? (
                          <Icon className="size-4 shrink-0" />
                        ) : (
                          <span className="size-4 shrink-0" />
                        )}
                        <span className="truncate">{tool.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </nav>
    </aside>
  );
}

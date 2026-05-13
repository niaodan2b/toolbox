import { Wrench } from "lucide-react";

import { findTool, tools } from "@/tools/registry";

interface ToolHostProps {
  activeId: string | undefined;
  onSelect: (id: string) => void;
}

export function ToolHost({ activeId, onSelect }: ToolHostProps) {
  const tool = findTool(activeId);

  if (!tool) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="bg-muted text-muted-foreground flex size-16 items-center justify-center rounded-full">
          <Wrench className="size-8" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">欢迎使用工具箱</h2>
          <p className="text-muted-foreground text-sm">
            请从左侧选择一个工具开始使用
          </p>
        </div>
        {tools.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2">
            {tools.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelect(t.id)}
                className="bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md px-3 py-1.5 text-sm"
              >
                {t.name}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const Component = tool.component;
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Component />
    </div>
  );
}

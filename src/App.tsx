import { useState } from "react";
import { Menu, Wrench } from "lucide-react";

import { useActiveTool } from "@/hooks/useActiveTool";
import { Sidebar } from "@/layout/Sidebar";
import { ToolHost } from "@/layout/ToolHost";
import { Toaster } from "@/components/ui/sonner";
import { findTool } from "@/tools/registry";
import { cn } from "@/lib/utils";

function App() {
  const { activeId, setActive } = useActiveTool();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const activeTool = findTool(activeId);

  const closeDrawer = () => setDrawerOpen(false);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden md:flex-row">
      {/* 移动端顶栏 */}
      <header className="bg-background flex h-14 shrink-0 items-center gap-2 border-b px-3 md:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="打开菜单"
          className="hover:bg-accent inline-flex size-9 items-center justify-center rounded-md"
        >
          <Menu className="size-5" />
        </button>
        <Wrench className="size-5" />
        <span className="truncate text-base font-semibold">
          {activeTool?.name ?? "工具箱"}
        </span>
      </header>

      {/* 遵居侧边栏（桌面）与抽屉（移动） */}
      <Sidebar
        activeId={activeId}
        onSelect={setActive}
        onAfterSelect={closeDrawer}
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] transform shadow-xl transition-transform duration-200",
          drawerOpen ? "translate-x-0" : "-translate-x-full",
          "md:static md:z-auto md:w-64 md:max-w-none md:translate-x-0 md:shadow-none md:transition-none",
        )}
      />

      {/* 移动端遮罩 */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={closeDrawer}
          aria-hidden
        />
      )}

      <main className="min-h-0 flex-1 overflow-hidden">
        <ToolHost activeId={activeId} onSelect={setActive} />
      </main>
      <Toaster position="top-right" />
    </div>
  );
}

export default App;

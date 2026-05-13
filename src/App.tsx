import { useActiveTool } from "@/hooks/useActiveTool";
import { Sidebar } from "@/layout/Sidebar";
import { ToolHost } from "@/layout/ToolHost";
import { Toaster } from "@/components/ui/sonner";

function App() {
  const { activeId, setActive } = useActiveTool();

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar activeId={activeId} onSelect={setActive} />
      <main className="flex-1 overflow-hidden">
        <ToolHost activeId={activeId} onSelect={setActive} />
      </main>
      <Toaster position="top-right" />
    </div>
  );
}

export default App;

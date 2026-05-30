import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowUp,
  ArrowDown,
  Copy,
  Download,
  Eraser,
  FilePlus,
  Pencil,
  Trash2,
  Merge,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import {
  formatSize,
  generateId,
  numToChinese,
  type TxtFileEntry,
} from "./utils";

export function TxtCombinerPanel() {
  const [files, setFiles] = useState<TxtFileEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 添加文件
  const handleAddFiles = () => {
    fileInputRef.current?.click();
  };

  const onFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    const newEntries: TxtFileEntry[] = [];
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      // 检查重复
      if (files.some((f) => f.filename === file.name && f.file.size === file.size)) {
        continue;
      }
      const filename = file.name;
      const alias = filename.toLowerCase().endsWith(".txt")
        ? filename.slice(0, -4)
        : filename;
      newEntries.push({
        id: generateId(),
        file,
        filename,
        alias,
        sizeStr: formatSize(file.size),
      });
    }

    if (newEntries.length > 0) {
      setFiles((prev) => [...prev, ...newEntries]);
      toast.success(`已添加 ${newEntries.length} 个文件`);
    } else {
      toast.info("文件已存在，未重复添加");
    }

    // 重置 input 以允许重复选择同一文件
    e.target.value = "";
  };

  // 上移
  const moveUp = () => {
    if (!selectedId) return;
    const idx = files.findIndex((f) => f.id === selectedId);
    if (idx <= 0) return;
    const newFiles = [...files];
    [newFiles[idx - 1], newFiles[idx]] = [newFiles[idx], newFiles[idx - 1]];
    setFiles(newFiles);
  };

  // 下移
  const moveDown = () => {
    if (!selectedId) return;
    const idx = files.findIndex((f) => f.id === selectedId);
    if (idx < 0 || idx >= files.length - 1) return;
    const newFiles = [...files];
    [newFiles[idx], newFiles[idx + 1]] = [newFiles[idx + 1], newFiles[idx]];
    setFiles(newFiles);
  };

  // 删除选中
  const removeSelected = () => {
    if (!selectedId) return;
    setFiles((prev) => prev.filter((f) => f.id !== selectedId));
    setSelectedId(null);
  };

  // 清空
  const clearAll = () => {
    if (files.length === 0) return;
    setFiles([]);
    setSelectedId(null);
    toast.success("已清空");
  };

  // 开始编辑别名
  const startEdit = (entry: TxtFileEntry) => {
    setEditingId(entry.id);
    setEditValue(entry.alias);
  };

  // 完成编辑
  const finishEdit = () => {
    if (!editingId) return;
    setFiles((prev) =>
      prev.map((f) =>
        f.id === editingId ? { ...f, alias: editValue.trim() || f.alias } : f
      )
    );
    setEditingId(null);
    setEditValue("");
  };

  // 读取文件内容
  const readFileContent = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error(`读取文件失败: ${file.name}`));
      reader.readAsText(file, "utf-8");
    });
  };

  // 合并文件
  const mergeFiles = async () => {
    if (files.length === 0) {
      toast.warning("请先添加文件");
      return;
    }

    try {
      const parts: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const entry = files[i];
        const chineseNum = numToChinese(i + 1);
        const header = `第${chineseNum}篇 《${entry.alias}》\n\n`;
        const content = await readFileContent(entry.file);
        parts.push(header + content);
      }
      const merged = parts.join("\n\n");
      return merged;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "合并失败");
      return null;
    }
  };

  // 下载合并文件
  const handleDownload = async () => {
    const merged = await mergeFiles();
    if (!merged) return;

    const blob = new Blob([merged], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "合并文件.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`合并完成！共 ${files.length} 个文件`);
  };

  // 复制合并结果
  const handleCopy = async () => {
    const merged = await mergeFiles();
    if (!merged) return;

    try {
      await navigator.clipboard.writeText(merged);
      toast.success("已复制合并结果到剪贴板");
    } catch {
      toast.error("复制失败");
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 p-4 md:p-6">
      <Card className="flex-1 flex flex-col">
        <CardHeader>
          <CardTitle>TXT 文件合并</CardTitle>
          <CardDescription>
            添加多个 TXT 文件，可编辑别名、调整顺序，合并为一个带中文序号标题的文件。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-4">
          {/* 操作按钮 */}
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleAddFiles}>
              <FilePlus />
              添加文件
            </Button>
            <Button
              variant="outline"
              onClick={moveUp}
              disabled={!selectedId || files.findIndex((f) => f.id === selectedId) <= 0}
            >
              <ArrowUp />
              上移
            </Button>
            <Button
              variant="outline"
              onClick={moveDown}
              disabled={
                !selectedId ||
                files.findIndex((f) => f.id === selectedId) >= files.length - 1
              }
            >
              <ArrowDown />
              下移
            </Button>
            <Button
              variant="outline"
              onClick={removeSelected}
              disabled={!selectedId}
            >
              <Trash2 />
              删除
            </Button>
            <Button variant="ghost" onClick={clearAll} disabled={files.length === 0}>
              <Eraser />
              清空
            </Button>
          </div>

          {/* 文件列表 */}
          <div className="flex-1 overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-center w-12">#</th>
                  <th className="px-3 py-2 text-left">文件名</th>
                  <th className="px-3 py-2 text-left">别名</th>
                  <th className="px-3 py-2 text-center w-20">大小</th>
                </tr>
              </thead>
              <tbody>
                {files.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                      点击"添加文件"选择 TXT 文件
                    </td>
                  </tr>
                ) : (
                  files.map((entry, idx) => (
                    <tr
                      key={entry.id}
                      className={`cursor-pointer border-b transition-colors hover:bg-muted/50 ${
                        selectedId === entry.id ? "bg-muted" : ""
                      }`}
                      onClick={() => setSelectedId(entry.id)}
                    >
                      <td className="px-3 py-2 text-center">{idx + 1}</td>
                      <td className="px-3 py-2 truncate max-w-[200px]" title={entry.filename}>
                        {entry.filename}
                      </td>
                      <td className="px-3 py-2">
                        {editingId === entry.id ? (
                          <input
                            className="w-full rounded border px-1 py-0.5 text-sm bg-background"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={finishEdit}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") finishEdit();
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            autoFocus
                          />
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 cursor-pointer hover:underline"
                            onDoubleClick={() => startEdit(entry)}
                          >
                            {entry.alias}
                            <Pencil className="w-3 h-3 text-muted-foreground" />
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center text-muted-foreground">
                        {entry.sizeStr}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* 合并操作 */}
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleDownload} disabled={files.length === 0}>
              <Download />
              下载合并文件
            </Button>
            <Button variant="outline" onClick={handleCopy} disabled={files.length === 0}>
              <Copy />
              复制合并结果
            </Button>
            <span className="text-sm text-muted-foreground ml-auto">
              {files.length > 0 && `共 ${files.length} 个文件`}
            </span>
          </div>

          {/* 隐藏的文件选择器 */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt"
            multiple
            className="hidden"
            onChange={onFilesSelected}
          />
        </CardContent>
      </Card>
    </div>
  );
}

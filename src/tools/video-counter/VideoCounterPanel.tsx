import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { Copy, Eraser, FilePlus, Video } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface VideoFileEntry {
  id: string;
  name: string;
  durationSeconds: number;
  durationStr: string;
  minutes: number;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    const url = URL.createObjectURL(file);
    video.src = url;

    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      if (isFinite(video.duration) && video.duration > 0) {
        resolve(video.duration);
      } else {
        reject(new Error(`无法读取时长: ${file.name}`));
      }
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`无法加载视频: ${file.name}`));
    };
  });
}

const VIDEO_EXTENSIONS = [".mp4", ".mkv", ".webm", ".avi", ".mov", ".flv", ".wmv", ".m4v"];

function isVideoFile(file: File): boolean {
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  return VIDEO_EXTENSIONS.includes(ext);
}

let idCounter = 0;
function generateId(): string {
  return `vc-${Date.now()}-${++idCounter}`;
}

export function VideoCounterPanel() {
  const [files, setFiles] = useState<VideoFileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFiles = useCallback(async (inputFiles: File[]) => {
    const videoFiles = inputFiles.filter(isVideoFile);
    if (videoFiles.length === 0) {
      toast.warning("未找到支持的视频文件");
      return;
    }

    setLoading(true);
    try {
      const entries: VideoFileEntry[] = [];
      for (const file of videoFiles) {
        try {
          const duration = await getVideoDuration(file);
          entries.push({
            id: generateId(),
            name: file.name,
            durationSeconds: duration,
            durationStr: formatDuration(duration),
            minutes: Math.round(duration / 60),
          });
        } catch (e) {
          console.warn(e);
        }
      }

      // 按文件名排序（不区分大小写）
      entries.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

      setFiles(entries);
      toast.success(`已加载 ${entries.length} 个视频文件`);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSelectFiles = () => {
    fileInputRef.current?.click();
  };

  const onFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;
    processFiles(Array.from(selectedFiles));
    e.target.value = "";
  };

  // 拖放
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      processFiles(droppedFiles);
    }
  };

  const clearAll = () => {
    setFiles([]);
    toast.success("已清空");
  };

  const totalMinutes = files.reduce((sum, f) => sum + f.minutes, 0);

  // 复制结果文本
  const handleCopy = async () => {
    if (files.length === 0) return;
    const lines = files.map((f) => `${f.durationStr} | ${f.minutes} | ${f.name}`);
    lines.push(`\nTotal: ${totalMinutes}`);
    const text = lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("已复制到剪贴板");
    } catch {
      toast.error("复制失败");
    }
  };

  return (
    <div
      className="flex h-full flex-col gap-4 p-4 md:p-6"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <Card className="flex-1 flex flex-col">
        <CardHeader>
          <CardTitle>视频时长统计</CardTitle>
          <CardDescription>
            选择或拖放视频文件，自动统计每个视频的时长及总分钟数。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-4">
          {/* 操作按钮 */}
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleSelectFiles} disabled={loading}>
              <FilePlus />
              选择视频
            </Button>
            <Button variant="outline" onClick={handleCopy} disabled={files.length === 0}>
              <Copy />
              复制结果
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
                  <th className="px-3 py-2 text-center w-24">时长</th>
                  <th className="px-3 py-2 text-center w-16">分钟</th>
                  <th className="px-3 py-2 text-left">文件名</th>
                </tr>
              </thead>
              <tbody>
                {files.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-12 text-center text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <Video className="w-8 h-8 opacity-50" />
                        <span>
                          {loading ? "正在读取视频信息…" : "拖放视频文件到此处，或点击【选择视频】"}
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  files.map((entry) => (
                    <tr key={entry.id} className="border-b transition-colors hover:bg-muted/50">
                      <td className="px-3 py-2 text-center font-mono">{entry.durationStr}</td>
                      <td className="px-3 py-2 text-center">{entry.minutes}</td>
                      <td className="px-3 py-2 truncate max-w-[400px]" title={entry.name}>
                        {entry.name}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* 统计信息 */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {files.length > 0 && `共 ${files.length} 个视频`}
            </span>
            {files.length > 0 && (
              <span className="text-base font-bold">
                Total: {totalMinutes} 分钟
              </span>
            )}
          </div>

          {/* 隐藏的文件选择器 */}
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,.mkv"
            multiple
            className="hidden"
            onChange={onFilesSelected}
          />
        </CardContent>
      </Card>
    </div>
  );
}

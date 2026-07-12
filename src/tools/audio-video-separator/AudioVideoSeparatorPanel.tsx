import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Film, Music, Video } from "lucide-react";
import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  buildOutputFilenames,
  isVideoFile,
  splitBaseNameAndExt,
  VIDEO_EXTENSIONS,
} from "./utils";

export function AudioVideoSeparatorPanel() {
  const [ffmpegReady, setFfmpegReady] = useState<boolean | null>(null);
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [videoName, setVideoName] = useState("");
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);

  const dropZoneRef = useRef<HTMLDivElement>(null);
  const tauriEnv = isTauri();

  const outputFilenames = useMemo(() => {
    if (!videoName) return null;
    const { baseName, ext } = splitBaseNameAndExt(videoName);
    return buildOutputFilenames(baseName, ext);
  }, [videoName]);

  useEffect(() => {
    if (!tauriEnv) return;

    invoke<string>("check_ffmpeg")
      .then(() => setFfmpegReady(true))
      .catch(() => setFfmpegReady(false));
  }, [tauriEnv]);

  const loadVideo = useCallback((selected: string) => {
    if (!isVideoFile(selected)) {
      toast.error("请选择支持的视频文件");
      return;
    }

    const fileName = selected.split(/[/\\]/).pop() ?? selected;
    setVideoPath(selected);
    setVideoName(fileName);
    setPreviewSrc(convertFileSrc(selected));
    setExportProgress("");
  }, []);

  const handleSelectVideo = useCallback(async () => {
    if (!tauriEnv) {
      toast.error("请在桌面应用中运行此工具");
      return;
    }

    const selected = await open({
      multiple: false,
      directory: false,
      filters: [
        {
          name: "视频文件",
          extensions: VIDEO_EXTENSIONS,
        },
      ],
    });

    if (!selected || Array.isArray(selected)) return;

    loadVideo(selected);
  }, [loadVideo, tauriEnv]);

  useEffect(() => {
    if (!tauriEnv || exporting) return;

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    const isPointInDropZone = (x: number, y: number) => {
      const rect = dropZoneRef.current?.getBoundingClientRect();
      if (!rect) return false;
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    };

    void getCurrentWebview()
      .onDragDropEvent((event) => {
        const payload = event.payload;

        if (payload.type === "over") {
          const inZone = isPointInDropZone(payload.position.x, payload.position.y);
          setIsDragOver(inZone);
          return;
        }

        setIsDragOver(false);

        if (payload.type !== "drop") return;

        const inZone = isPointInDropZone(payload.position.x, payload.position.y);
        if (!inZone) return;

        const path = payload.paths.find(isVideoFile);
        if (!path) {
          toast.error("请拖入支持的视频文件");
          return;
        }

        loadVideo(path);
      })
      .then((fn) => {
        if (cancelled) {
          fn();
          return;
        }
        unlisten = fn;
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [exporting, loadVideo, tauriEnv]);

  const handleSeparate = async () => {
    if (!videoPath || !outputFilenames || !tauriEnv) return;

    const outputDir = await open({
      multiple: false,
      directory: true,
    });
    if (!outputDir || Array.isArray(outputDir)) return;

    setExporting(true);
    setExportProgress("正在分离音视频...");

    try {
      const written = await invoke<string[]>("separate_audio_video", {
        inputPath: videoPath,
        outputDir,
        audioFilename: outputFilenames.audio,
        videoFilename: outputFilenames.video,
      });

      setExportProgress(`完成，已导出 ${written.length} 个文件`);
      toast.success("音视频分离完成");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setExportProgress("");
      toast.error(message);
    } finally {
      setExporting(false);
    }
  };

  const canExport = tauriEnv && ffmpegReady !== false && !!videoPath && !exporting;

  return (
    <div className="flex h-full flex-col gap-4 p-4 md:p-6">
      {!tauriEnv && (
        <Card className="border-amber-500/40 bg-amber-500/10">
          <CardContent className="py-3 text-sm text-amber-900 dark:text-amber-100">
            此工具依赖桌面端能力，请在 Tauri 应用中运行。
          </CardContent>
        </Card>
      )}

      {tauriEnv && ffmpegReady === false && (
        <Card className="border-destructive/40 bg-destructive/10">
          <CardContent className="py-3 text-sm text-destructive">
            未检测到 ffmpeg。请先安装（macOS: `brew install ffmpeg`）。
          </CardContent>
        </Card>
      )}

      <Card className="flex flex-1 flex-col">
        <CardHeader>
          <CardTitle>音视频分离</CardTitle>
          <CardDescription>
            选择视频后，将同时导出 MP3 音频和无声视频到指定目录。无声视频优先流复制以保持画质与速度。
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleSelectVideo} disabled={!tauriEnv || exporting}>
              <Video />
              选择视频
            </Button>
            {videoName && (
              <span className="truncate text-sm text-muted-foreground" title={videoName}>
                {videoName}
              </span>
            )}
          </div>

          <div
            ref={dropZoneRef}
            className={cn(
              "relative flex min-h-70 flex-col gap-3 rounded-md border p-3 transition-colors",
              isDragOver && "border-primary bg-primary/5 ring-2 ring-primary/30",
            )}
          >
            {isDragOver && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md bg-primary/10">
                <span className="text-sm font-medium text-primary">释放以加载视频</span>
              </div>
            )}
            {previewSrc ? (
              <video
                src={previewSrc}
                className="max-h-105 w-full rounded-md bg-black object-contain"
                controls={true}
              />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
                <Film className="size-10 opacity-50" />
                <span>请选择或拖入视频文件</span>
              </div>
            )}
          </div>

          {outputFilenames && (
            <div className="rounded-md border px-4 py-3 text-sm">
              <div className="font-medium">将导出以下文件</div>
              <ul className="mt-2 space-y-1.5 text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Music className="size-4 shrink-0" />
                  <span className="font-mono">{outputFilenames.audio}</span>
                </li>
                <li className="flex items-center gap-2">
                  <Video className="size-4 shrink-0" />
                  <span className="font-mono">{outputFilenames.video}</span>
                </li>
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-3">
            {exportProgress && (
              <span className="text-sm text-muted-foreground">{exportProgress}</span>
            )}
            <Button onClick={handleSeparate} disabled={!canExport}>
              <Film />
              开始分离
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

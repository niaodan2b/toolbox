import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { MapPin, Pause, Play, Scissors, Trash2, Video } from "lucide-react";
import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
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
  buildOutputFilename,
  computeSegments,
  formatTime,
  isDuplicateMarker,
  isValidMarker,
  parseTime,
  splitBaseNameAndExt,
} from "./utils";

interface Marker {
  id: string;
  seconds: number;
}

const VIDEO_EXTENSIONS = ["mp4", "mkv", "webm", "avi", "mov", "flv", "wmv", "m4v"];

let markerIdCounter = 0;
function createMarkerId(): string {
  return `marker-${Date.now()}-${++markerIdCounter}`;
}

export function VideoSplitterPanel() {
  const [ffmpegReady, setFfmpegReady] = useState<boolean | null>(null);
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [videoName, setVideoName] = useState("");
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [markerInputs, setMarkerInputs] = useState<Record<string, string>>({});
  const [invalidMarkerIds, setInvalidMarkerIds] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const tauriEnv = isTauri();

  useEffect(() => {
    if (!tauriEnv) return;

    invoke<string>("check_ffmpeg")
      .then(() => setFfmpegReady(true))
      .catch(() => setFfmpegReady(false));
  }, [tauriEnv]);

  const resetVideoState = useCallback(() => {
    setDuration(0);
    setCurrentTime(0);
    setIsPlaying(false);
    setMarkers([]);
    setMarkerInputs({});
    setInvalidMarkerIds(new Set());
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

    const fileName = selected.split(/[/\\]/).pop() ?? selected;
    resetVideoState();
    setVideoPath(selected);
    setVideoName(fileName);
    setPreviewSrc(convertFileSrc(selected));
  }, [resetVideoState, tauriEnv]);

  const sortedMarkers = useMemo(
    () => [...markers].sort((a, b) => a.seconds - b.seconds),
    [markers],
  );

  const segments = useMemo(
    () => computeSegments(sortedMarkers.map((marker) => marker.seconds), duration),
    [sortedMarkers, duration],
  );

  const { baseName, ext } = useMemo(
    () => splitBaseNameAndExt(videoName),
    [videoName],
  );

  const canExport =
    tauriEnv &&
    ffmpegReady === true &&
    !!videoPath &&
    markers.length > 0 &&
    invalidMarkerIds.size === 0 &&
    segments.length > 0 &&
    !exporting;

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) {
      toast.error("无法读取视频时长");
      return;
    }
    setDuration(video.duration);
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);
  };

  const togglePlayback = async () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      try {
        await video.play();
        setIsPlaying(true);
      } catch {
        toast.error("无法播放视频");
      }
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const seekTo = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = seconds;
    setCurrentTime(seconds);
  };

  const addMarker = () => {
    if (!videoRef.current || duration <= 0) return;

    const seconds = videoRef.current.currentTime;
    if (!isValidMarker(seconds, duration)) return;
    if (isDuplicateMarker(markers.map((marker) => marker.seconds), seconds)) return;

    const id = createMarkerId();
    const formatted = formatTime(seconds);
    setMarkers((prev) => [...prev, { id, seconds }]);
    setMarkerInputs((prev) => ({ ...prev, [id]: formatted }));
  };

  const removeMarker = (id: string) => {
    setMarkers((prev) => prev.filter((marker) => marker.id !== id));
    setMarkerInputs((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setInvalidMarkerIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const updateMarkerInput = (id: string, value: string) => {
    setMarkerInputs((prev) => ({ ...prev, [id]: value }));

    const parsed = parseTime(value);
    if (parsed === null || !isValidMarker(parsed, duration)) {
      setInvalidMarkerIds((prev) => new Set(prev).add(id));
      return;
    }

    const otherMarkers = markers
      .filter((marker) => marker.id !== id)
      .map((marker) => marker.seconds);
    if (isDuplicateMarker(otherMarkers, parsed)) {
      setInvalidMarkerIds((prev) => new Set(prev).add(id));
      return;
    }

    setInvalidMarkerIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

    setMarkers((prev) =>
      prev.map((marker) => (marker.id === id ? { ...marker, seconds: parsed } : marker)),
    );
  };

  const handleExport = async () => {
    if (!videoPath || !tauriEnv) return;
    if (markers.length === 0 || invalidMarkerIds.size > 0 || segments.length === 0) return;

    const outputDir = await open({
      multiple: false,
      directory: true,
    });
    if (!outputDir || Array.isArray(outputDir)) return;

    const payload = segments.map((segment) => ({
      start: segment.start,
      end: segment.end,
      filename: buildOutputFilename(baseName, ext, segment.start, segment.end),
    }));

    setExporting(true);
    setExportProgress(`正在分割 0 / ${payload.length} 段...`);

    try {
      const written = await invoke<string[]>("split_video", {
        inputPath: videoPath,
        outputDir,
        segments: payload,
      });

      setExportProgress(`完成，共导出 ${written.length} 个片段`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setExportProgress("");
      toast.error(message);
    } finally {
      setExporting(false);
    }
  };

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
            未检测到 ffmpeg。请先安装并确保可在终端执行 `ffmpeg`（macOS: `brew install ffmpeg`）。
          </CardContent>
        </Card>
      )}

      <Card className="flex flex-1 flex-col">
        <CardHeader>
          <CardTitle>视频分割</CardTitle>
          <CardDescription>
            选择视频并标记切割点，点击「开始分割」选择输出目录后导出。采用重编码以实现精确切割，耗时较流复制更长。
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

          <div className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
            <div className="flex min-h-70 flex-col gap-3 rounded-md border p-3">
              {previewSrc ? (
                <video
                  ref={videoRef}
                  src={previewSrc}
                  className="max-h-105 w-full rounded-md bg-black object-contain"
                  controls={false}
                  onLoadedMetadata={handleLoadedMetadata}
                  onTimeUpdate={handleTimeUpdate}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => setIsPlaying(false)}
                />
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
                  <Video className="size-10 opacity-50" />
                  <span>请选择视频文件</span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm">
                  {formatTime(currentTime)} / {duration > 0 ? formatTime(duration) : "--:--:--"}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={togglePlayback}
                  disabled={!previewSrc}
                >
                  {isPlaying ? <Pause /> : <Play />}
                  {isPlaying ? "暂停" : "播放"}
                </Button>
                <Button size="sm" onClick={addMarker} disabled={!previewSrc || duration <= 0}>
                  <MapPin />
                  添加标记
                </Button>
              </div>
            </div>

            <div className="flex min-h-70 flex-col rounded-md border">
              <div className="border-b px-3 py-2 text-sm font-medium">
                标记 ({sortedMarkers.length})
              </div>
              <div className="flex-1 overflow-auto p-2">
                {sortedMarkers.length === 0 ? (
                  <div className="flex h-full items-center justify-center px-3 text-center text-sm text-muted-foreground">
                    暂无标记
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {sortedMarkers.map((marker, index) => (
                      <li
                        key={marker.id}
                        className="flex items-center gap-2 rounded-md border px-2 py-1.5"
                      >
                        <button
                          type="button"
                          className="w-6 shrink-0 text-left text-xs text-muted-foreground"
                          onClick={() => seekTo(marker.seconds)}
                          title="跳转到该时间"
                        >
                          {index + 1}.
                        </button>
                        <input
                          value={markerInputs[marker.id] ?? formatTime(marker.seconds)}
                          onChange={(event) => updateMarkerInput(marker.id, event.target.value)}
                          className={cn(
                            "h-8 flex-1 rounded-md border bg-background px-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                            invalidMarkerIds.has(marker.id) && "border-destructive",
                          )}
                          aria-invalid={invalidMarkerIds.has(marker.id)}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removeMarker(marker.id)}
                          disabled={exporting}
                          aria-label="删除标记"
                        >
                          <Trash2 />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            {exportProgress && (
              <span className="text-sm text-muted-foreground">{exportProgress}</span>
            )}
            <Button onClick={handleExport} disabled={!canExport}>
              <Scissors />
              开始分割
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

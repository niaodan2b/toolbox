import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  MapPin,
  Pause,
  Play,
  Scissors,
  Trash2,
  Video,
} from "lucide-react";
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
const AUDIO_EXTENSIONS = ["mp3", "wav"];
const MEDIA_EXTENSIONS = [...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS];

type MediaKind = "video" | "audio";

function getExtension(path: string): string | undefined {
  return path.split(".").pop()?.toLowerCase();
}

function isMediaFile(path: string): boolean {
  const ext = getExtension(path);
  return !!ext && MEDIA_EXTENSIONS.includes(ext);
}

function getMediaKind(path: string): MediaKind | null {
  const ext = getExtension(path);
  if (!ext) return null;
  if (AUDIO_EXTENSIONS.includes(ext)) return "audio";
  if (VIDEO_EXTENSIONS.includes(ext)) return "video";
  return null;
}

let markerIdCounter = 0;
function createMarkerId(): string {
  return `marker-${Date.now()}-${++markerIdCounter}`;
}

export function VideoSplitterPanel() {
  const [ffmpegReady, setFfmpegReady] = useState<boolean | null>(null);
  const [mediaPath, setMediaPath] = useState<string | null>(null);
  const [mediaName, setMediaName] = useState("");
  const [mediaKind, setMediaKind] = useState<MediaKind | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [markerInputs, setMarkerInputs] = useState<Record<string, string>>({});
  const [invalidMarkerIds, setInvalidMarkerIds] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [segmentDialogOpen, setSegmentDialogOpen] = useState(false);
  const [selectedSegmentIndices, setSelectedSegmentIndices] = useState<Set<number>>(
    new Set(),
  );

  const mediaRef = useRef<HTMLMediaElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const tauriEnv = isTauri();

  useEffect(() => {
    if (!tauriEnv) return;

    invoke<string>("check_ffmpeg")
      .then(() => setFfmpegReady(true))
      .catch(() => setFfmpegReady(false));
  }, [tauriEnv]);

  const resetMediaState = useCallback(() => {
    setDuration(0);
    setCurrentTime(0);
    setIsPlaying(false);
    setMarkers([]);
    setMarkerInputs({});
    setInvalidMarkerIds(new Set());
    setExportProgress("");
  }, []);

  const loadMedia = useCallback(
    (selected: string) => {
      if (markers.length > 0) {
        toast.error("存在标记时无法更换文件，请先删除所有标记");
        return;
      }

      const kind = getMediaKind(selected);
      if (!kind || !isMediaFile(selected)) {
        toast.error("请选择支持的媒体文件");
        return;
      }

      const fileName = selected.split(/[/\\]/).pop() ?? selected;
      resetMediaState();
      setMediaPath(selected);
      setMediaName(fileName);
      setMediaKind(kind);
      setPreviewSrc(convertFileSrc(selected));
    },
    [markers.length, resetMediaState],
  );

  const handleSelectMedia = useCallback(async () => {
    if (!tauriEnv) {
      toast.error("请在桌面应用中运行此工具");
      return;
    }

    const selected = await open({
      multiple: false,
      directory: false,
      filters: [
        {
          name: "媒体文件",
          extensions: MEDIA_EXTENSIONS,
        },
      ],
    });

    if (!selected || Array.isArray(selected)) return;

    loadMedia(selected);
  }, [loadMedia, tauriEnv]);

  useEffect(() => {
    if (!tauriEnv || exporting || markers.length > 0) return;

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
          setIsDragOver(isPointInDropZone(payload.position.x, payload.position.y));
          return;
        }

        setIsDragOver(false);

        if (payload.type !== "drop") return;
        if (!isPointInDropZone(payload.position.x, payload.position.y)) return;

        const droppedMedia = payload.paths.find(isMediaFile);
        if (!droppedMedia) {
          toast.error("请拖入支持的媒体文件");
          return;
        }

        loadMedia(droppedMedia);
      })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      });

    return () => {
      cancelled = true;
      unlisten?.();
      setIsDragOver(false);
    };
  }, [exporting, loadMedia, markers.length, tauriEnv]);

  const sortedMarkers = useMemo(
    () => [...markers].sort((a, b) => a.seconds - b.seconds),
    [markers],
  );

  const segments = useMemo(
    () => computeSegments(sortedMarkers.map((marker) => marker.seconds), duration),
    [sortedMarkers, duration],
  );

  const { baseName, ext } = useMemo(
    () => splitBaseNameAndExt(mediaName),
    [mediaName],
  );

  const canExport =
    tauriEnv &&
    ffmpegReady === true &&
    !!mediaPath &&
    markers.length > 0 &&
    invalidMarkerIds.size === 0 &&
    segments.length > 0 &&
    !exporting;

  const handleLoadedMetadata = () => {
    const media = mediaRef.current;
    if (!media || !Number.isFinite(media.duration) || media.duration <= 0) {
      toast.error("无法读取媒体时长");
      return;
    }
    setDuration(media.duration);
  };

  const handleTimeUpdate = () => {
    const media = mediaRef.current;
    if (!media) return;
    setCurrentTime(media.currentTime);
  };

  const togglePlayback = async () => {
    const media = mediaRef.current;
    if (!media) return;

    if (media.paused) {
      try {
        await media.play();
        setIsPlaying(true);
      } catch {
        toast.error("无法播放媒体");
      }
    } else {
      media.pause();
      setIsPlaying(false);
    }
  };

  const seekTo = (seconds: number) => {
    const media = mediaRef.current;
    if (!media) return;
    media.currentTime = seconds;
    setCurrentTime(seconds);
  };

  const seekBy = (deltaSeconds: number) => {
    const media = mediaRef.current;
    if (!media) return;
    const maxTime = duration > 0 ? duration : media.duration;
    const next = Math.min(Math.max(0, media.currentTime + deltaSeconds), maxTime || 0);
    seekTo(next);
  };

  const addMarker = () => {
    if (!mediaRef.current || duration <= 0) return;

    const seconds = mediaRef.current.currentTime;
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

  const handleOpenExportDialog = () => {
    if (markers.length === 0 || invalidMarkerIds.size > 0 || segments.length === 0) return;
    setSelectedSegmentIndices(
      new Set(
        segments.flatMap((segment, index) =>
          segment.end - segment.start < 60 ? [index] : [],
        ),
      ),
    );
    setSegmentDialogOpen(true);
  };

  const toggleSegmentSelection = (index: number) => {
    setSelectedSegmentIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const selectAllSegments = () => {
    setSelectedSegmentIndices(new Set(segments.map((_, index) => index)));
  };

  const deselectAllSegments = () => {
    setSelectedSegmentIndices(new Set());
  };

  const handleConfirmExport = async () => {
    if (!mediaPath || !tauriEnv) return;
    if (selectedSegmentIndices.size === 0) {
      toast.error("请至少选择一个片段");
      return;
    }

    const selectedSegments = segments.filter((_, index) => selectedSegmentIndices.has(index));
    setSegmentDialogOpen(false);

    const outputDir = await open({
      multiple: false,
      directory: true,
    });
    if (!outputDir || Array.isArray(outputDir)) return;

    const payload = selectedSegments.map((segment) => ({
      start: segment.start,
      end: segment.end,
      filename: buildOutputFilename(baseName, ext, segment.start, segment.end),
    }));

    setExporting(true);
    setExportProgress(`正在分割 0 / ${payload.length} 段...`);

    try {
      const written = await invoke<string[]>("split_video", {
        inputPath: mediaPath,
        outputDir,
        segments: payload,
      });

      setExportProgress(`完成，共导出 ${written.length} 个片段`);
      setMarkers([]);
      setMarkerInputs({});
      setInvalidMarkerIds(new Set());
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
            未检测到 ffmpeg。请先安装（macOS: `brew install ffmpeg`）。
          </CardContent>
        </Card>
      )}

      <Card className="flex flex-1 flex-col">
        <CardHeader>
          <CardTitle>视频分割</CardTitle>
          <CardDescription>
            选择视频或音频（mp3/wav）并标记切割点，点击「开始分割」勾选要导出的片段后选择输出目录。采用重编码以实现精确切割，耗时较流复制更长。
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={handleSelectMedia}
              disabled={!tauriEnv || exporting || markers.length > 0}
              title={markers.length > 0 ? "请先删除所有标记后再更换文件" : undefined}
            >
              <Video />
              选择文件
            </Button>
            {mediaName && (
              <span className="truncate text-sm text-muted-foreground" title={mediaName}>
                {mediaName}
              </span>
            )}
          </div>

          <div className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
            <div
              ref={dropZoneRef}
              className={cn(
                "relative flex min-h-70 flex-col gap-3 rounded-md border p-3 transition-colors",
                isDragOver && "border-primary bg-primary/5 ring-2 ring-primary/30",
              )}
            >
              {isDragOver && (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md bg-primary/10">
                  <span className="text-sm font-medium text-primary">释放以加载媒体</span>
                </div>
              )}
              {previewSrc && mediaKind === "video" ? (
                <video
                  ref={(el) => {
                    mediaRef.current = el;
                  }}
                  src={previewSrc}
                  className="max-h-105 w-full rounded-md bg-black object-contain"
                  controls={true}
                  onLoadedMetadata={handleLoadedMetadata}
                  onTimeUpdate={handleTimeUpdate}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => setIsPlaying(false)}
                />
              ) : previewSrc && mediaKind === "audio" ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-4 py-8">
                  <audio
                    ref={(el) => {
                      mediaRef.current = el;
                    }}
                    src={previewSrc}
                    className="w-full"
                    controls={true}
                    onLoadedMetadata={handleLoadedMetadata}
                    onTimeUpdate={handleTimeUpdate}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onEnded={() => setIsPlaying(false)}
                  />
                </div>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
                  <Video className="size-10 opacity-50" />
                  <span>请选择或拖入媒体文件</span>
                </div>
              )}

              {previewSrc && (
                <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => seekBy(-120)}
                      aria-label="快退 2 分钟"
                      title="快退 2 分钟"
                    >
                      -2min
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => seekBy(-30)}
                      aria-label="快退 30 秒"
                      title="快退 30 秒"
                    >
                      -30s
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => seekBy(-5)}
                      aria-label="快退 5 秒"
                      title="快退 5 秒"
                    >
                      -5s
                    </Button>
                    <Button
                      size="icon"
                      variant="secondary"
                      onClick={togglePlayback}
                      aria-label={isPlaying ? "暂停" : "播放"}
                      title={isPlaying ? "暂停" : "播放"}
                    >
                      {isPlaying ? <Pause /> : <Play />}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => seekBy(5)}
                      aria-label="快进 5 秒"
                      title="快进 5 秒"
                    >
                      +5s
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => seekBy(30)}
                      aria-label="快进 30 秒"
                      title="快进 30 秒"
                    >
                      +30s
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => seekBy(120)}
                      aria-label="快进 2 分钟"
                      title="快进 2 分钟"
                    >
                    +2min
                  </Button>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm">
                  {formatTime(currentTime)} / {duration > 0 ? formatTime(duration) : "--:--:--.---"}
                </span>
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
            <Button onClick={handleOpenExportDialog} disabled={!canExport}>
              <Scissors />
              开始分割
            </Button>
          </div>
        </CardContent>
      </Card>

      {segmentDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSegmentDialogOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="segment-dialog-title"
            className="flex max-h-[min(80vh,640px)] w-full max-w-lg flex-col rounded-xl border bg-card shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b px-6 py-4">
              <h2 id="segment-dialog-title" className="text-lg font-semibold">
                选择要导出的片段
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                共 {segments.length} 个片段，已选 {selectedSegmentIndices.size} 个
              </p>
            </div>

            <div className="flex items-center gap-2 border-b px-6 py-2">
              <Button size="sm" variant="outline" onClick={selectAllSegments}>
                全选
              </Button>
              <Button size="sm" variant="outline" onClick={deselectAllSegments}>
                取消全选
              </Button>
            </div>

            <ul className="flex-1 space-y-2 overflow-auto p-4">
              {segments.map((segment, index) => {
                const length = segment.end - segment.start;
                const checked = selectedSegmentIndices.has(index);

                return (
                  <li key={`${segment.start}-${segment.end}`}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 transition-colors",
                        checked && "border-primary/40 bg-primary/5",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-1 size-4 shrink-0 accent-primary"
                        checked={checked}
                        onChange={() => toggleSegmentSelection(index)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">片段 {index + 1}</div>
                        <div className="mt-0.5 font-mono text-sm text-muted-foreground">
                          {formatTime(segment.start)} → {formatTime(segment.end)}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          长度 {formatTime(length)}
                        </div>
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>

            <div className="flex justify-end gap-2 border-t px-6 py-4">
              <Button variant="outline" onClick={() => setSegmentDialogOpen(false)}>
                取消
              </Button>
              <Button
                onClick={handleConfirmExport}
                disabled={selectedSegmentIndices.size === 0}
              >
                <Scissors />
                导出选中片段
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

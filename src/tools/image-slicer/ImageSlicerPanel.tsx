import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { toast } from "sonner";
import {
  Download,
  Eraser,
  Eye,
  EyeOff,
  Image as ImageIcon,
  ScanEye,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Slice {
  id: string;
  /** 自然像素顶部 Y */
  top: number;
  /** 自然像素底部 Y */
  bottom: number;
  included: boolean;
}

interface Range {
  from: number;
  to: number;
}

/** 合并并规范化区间集合 */
function normalizeRanges(ranges: Range[]): Range[] {
  if (ranges.length === 0) return ranges;
  const sorted = [...ranges]
    .filter((r) => r.to > r.from)
    .sort((a, b) => a.from - b.from);
  const merged: Range[] = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r.from <= last.to) {
      last.to = Math.max(last.to, r.to);
    } else {
      merged.push({ from: r.from, to: r.to });
    }
  }
  return merged;
}

/** 在区间集合中加入一段 [from,to]，返回合并后的新集合 */
function addRange(ranges: Range[], from: number, to: number): Range[] {
  return normalizeRanges([...ranges, { from, to }]);
}

/** 从区间集合中减去一段 [from,to]，可能拆分原区间 */
function subtractRange(ranges: Range[], from: number, to: number): Range[] {
  const result: Range[] = [];
  for (const r of ranges) {
    if (r.to <= from || r.from >= to) {
      result.push(r);
      continue;
    }
    if (r.from < from) result.push({ from: r.from, to: from });
    if (r.to > to) result.push({ from: to, to: r.to });
  }
  return result;
}

/** 判断 [top,bottom] 是否完全落在某个排除区间中 */
function isCovered(top: number, bottom: number, ranges: Range[]): boolean {
  return ranges.some((r) => r.from <= top && bottom <= r.to);
}

export function ImageSlicerPanel() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string>("");
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(
    null,
  );
  /** 切割线 Y 位置（自然像素，已排序） */
  const [cuts, setCuts] = useState<number[]>([]);
  /** 被排除的 Y 像素区间集合（与切割线无关，按区间记录，避免新增切割线时丢失） */
  const [excludedRanges, setExcludedRanges] = useState<Range[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewSize, setPreviewSize] = useState<{ w: number; h: number } | null>(
    null,
  );

  const imgRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const clearPreview = useCallback(() => {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPreviewSize(null);
  }, []);

  const resetCuts = useCallback(() => {
    setCuts([]);
    setExcludedRanges([]);
    clearPreview();
  }, [clearPreview]);

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("请选择图片文件");
      return;
    }
    const url = URL.createObjectURL(file);
    setImageSrc((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    setImageName(file.name);
    setNaturalSize(null);
    resetCuts();
  };

  useEffect(() => {
    return () => {
      if (imageSrc) URL.revokeObjectURL(imageSrc);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 切割线或保留状态变化时，旧预览失效
  useEffect(() => {
    clearPreview();
  }, [cuts, excludedRanges, clearPreview]);

  const handleImageLoad = () => {
    const img = imgRef.current;
    if (!img) return;
    setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
  };

  const slices: Slice[] = useMemo(() => {
    if (!naturalSize) return [];
    const sorted = [...cuts].sort((a, b) => a - b);
    const bounds = [0, ...sorted, naturalSize.h];
    const result: Slice[] = [];
    for (let i = 0; i < bounds.length - 1; i++) {
      const top = bounds[i];
      const bottom = bounds[i + 1];
      result.push({
        id: `slice-${i}-${top}-${bottom}`,
        top,
        bottom,
        included: !isCovered(top, bottom, excludedRanges),
      });
    }
    return result;
  }, [cuts, naturalSize, excludedRanges]);

  const keptCount = slices.filter((s) => s.included).length;

  const buildCanvas = (): HTMLCanvasElement | null => {
    if (!imgRef.current || !naturalSize) {
      toast.info("请先加载图片");
      return null;
    }
    const kept = slices.filter((s) => s.included);
    if (kept.length === 0) {
      toast.error("没有保留任何图块");
      return null;
    }
    const totalH = kept.reduce((sum, s) => sum + (s.bottom - s.top), 0);
    const canvas = document.createElement("canvas");
    canvas.width = naturalSize.w;
    canvas.height = totalH;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      toast.error("创建画布失败");
      return null;
    }
    let yCursor = 0;
    for (const s of kept) {
      const h = s.bottom - s.top;
      ctx.drawImage(
        imgRef.current,
        0,
        s.top,
        naturalSize.w,
        h,
        0,
        yCursor,
        naturalSize.w,
        h,
      );
      yCursor += h;
    }
    return canvas;
  };

  const handlePreview = () => {
    const canvas = buildCanvas();
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) {
        toast.error("生成预览失败");
        return;
      }
      const url = URL.createObjectURL(blob);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      setPreviewSize({ w: canvas.width, h: canvas.height });
      toast.success("已生成预览");
    }, "image/png");
  };

  const handleImageClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!naturalSize || !imgRef.current) return;
    if (dragIndex !== null) return;
    const rect = imgRef.current.getBoundingClientRect();
    const relY = e.clientY - rect.top;
    if (relY < 0 || relY > rect.height) return;
    const scale = rect.height / naturalSize.h;
    const natY = Math.round(relY / scale);
    if (natY <= 0 || natY >= naturalSize.h) return;
    // 避免与已有切割线过于接近
    if (cuts.some((c) => Math.abs(c - natY) < 2)) return;
    setCuts((prev) => [...prev, natY].sort((a, b) => a - b));
  };

  const removeCut = (y: number) => {
    setCuts((prev) => prev.filter((c) => c !== y));
  };

  const toggleSlice = (idx: number) => {
    const slice = slices[idx];
    if (!slice) return;
    setExcludedRanges((prev) =>
      slice.included
        ? addRange(prev, slice.top, slice.bottom)
        : subtractRange(prev, slice.top, slice.bottom),
    );
  };

  const handleClearImage = () => {
    if (imageSrc) URL.revokeObjectURL(imageSrc);
    setImageSrc(null);
    setImageName("");
    setNaturalSize(null);
    resetCuts();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const downloadFromUrl = (url: string) => {
    const a = document.createElement("a");
    const base = imageName.replace(/\.[^.]+$/, "") || "spliced";
    a.href = url;
    a.download = `${base}-spliced.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleExport = () => {
    // 如果已生成预览，直接下载预览结果，避免重复绘制
    if (previewUrl) {
      downloadFromUrl(previewUrl);
      toast.success("已导出拼接图片");
      return;
    }
    const canvas = buildCanvas();
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) {
        toast.error("导出失败");
        return;
      }
      const url = URL.createObjectURL(blob);
      downloadFromUrl(url);
      URL.revokeObjectURL(url);
      toast.success("已导出拼接图片");
    }, "image/png");
  };

  const handleLineMouseDown = (idx: number, e: ReactMouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setDragIndex(idx);
  };

  useEffect(() => {
    if (dragIndex === null) return;
    const handleMove = (e: MouseEvent) => {
      if (!imgRef.current || !naturalSize) return;
      const rect = imgRef.current.getBoundingClientRect();
      const relY = e.clientY - rect.top;
      const scale = rect.height / naturalSize.h;
      const natY = Math.max(
        1,
        Math.min(naturalSize.h - 1, Math.round(relY / scale)),
      );
      setCuts((prev) => {
        const next = [...prev];
        next[dragIndex] = natY;
        return next;
      });
    };
    const handleUp = () => {
      setDragIndex(null);
      setCuts((prev) => [...prev].sort((a, b) => a - b));
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragIndex, naturalSize]);

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle>切图</CardTitle>
          <CardDescription>
            选择一张本地图片，点击图片添加水平切割线，将其分为若干图块；可选择排除部分图块，最后拼接导出为 PNG。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <Button onClick={() => fileInputRef.current?.click()}>
              <Upload />
              选择图片
            </Button>
            <Button
              variant="outline"
              onClick={resetCuts}
              disabled={!imageSrc || cuts.length === 0}
            >
              <Eraser />
              清除切割线
            </Button>
            <Button
              variant="ghost"
              onClick={handleClearImage}
              disabled={!imageSrc}
            >
              <Trash2 />
              移除图片
            </Button>
            <div className="flex-1" />
            <Button
              variant="secondary"
              onClick={handlePreview}
              disabled={!imageSrc || keptCount === 0}
            >
              <ScanEye />
              预览
            </Button>
            <Button
              onClick={handleExport}
              disabled={!imageSrc || keptCount === 0}
            >
              <Download />
              导出拼接图
            </Button>
          </div>
          {imageSrc && (
            <div className="text-muted-foreground text-xs">
              {imageName}
              {naturalSize && ` · ${naturalSize.w}×${naturalSize.h}`}
              {` · ${cuts.length} 条切割线`}
              {` · 保留 ${keptCount}/${slices.length} 图块`}
            </div>
          )}
        </CardContent>
      </Card>

      {previewUrl && previewSize && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="flex flex-col gap-1.5">
              <CardTitle className="text-base">导出预览</CardTitle>
              <CardDescription>
                {previewSize.w}×{previewSize.h} · 保留 {keptCount}/{slices.length}{" "}
                图块。确认无误后点击「导出拼接图」即可保存。
              </CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={clearPreview}>
              <X />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="flex max-h-[60vh] justify-center overflow-auto rounded-md border bg-[--muted] p-2">
              <img
                src={previewUrl}
                alt="导出预览"
                className="h-auto max-w-full"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {imageSrc ? (
        <div className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="text-base">预览与切割</CardTitle>
              <CardDescription>
                点击图片任意位置添加水平切割线；拖动已有切割线可调整位置；点击线上的 × 删除该切割线。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className="relative mx-auto w-full select-none"
                onClick={handleImageClick}
                style={{
                  cursor: dragIndex === null ? "crosshair" : "ns-resize",
                }}
              >
                <img
                  ref={imgRef}
                  src={imageSrc}
                  alt={imageName}
                  onLoad={handleImageLoad}
                  className="block h-auto w-full"
                  draggable={false}
                />
                {naturalSize &&
                  slices.map((s, idx) => {
                    const topPct = (s.top / naturalSize.h) * 100;
                    const heightPct =
                      ((s.bottom - s.top) / naturalSize.h) * 100;
                    return (
                      <div
                        key={s.id}
                        className={cn(
                          "pointer-events-none absolute left-0 right-0 flex items-start justify-start p-1",
                          !s.included && "bg-destructive/40",
                        )}
                        style={{
                          top: `${topPct}%`,
                          height: `${heightPct}%`,
                        }}
                      >
                        <span className="bg-background/80 rounded px-1.5 py-0.5 text-xs font-medium shadow-sm">
                          #{idx + 1}
                          {!s.included && " · 已排除"}
                        </span>
                      </div>
                    );
                  })}
                {naturalSize &&
                  cuts.map((y, i) => {
                    const topPct = (y / naturalSize.h) * 100;
                    return (
                      <div
                        key={`cut-${i}-${y}`}
                        className="bg-primary absolute left-0 right-0 h-0.5 cursor-ns-resize shadow-sm"
                        style={{
                          top: `${topPct}%`,
                          transform: "translateY(-1px)",
                        }}
                        onMouseDown={(e) => handleLineMouseDown(i, e)}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="absolute -top-2 left-0 right-0 h-5" />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeCut(y);
                          }}
                          className="bg-destructive text-destructive-foreground absolute -top-3 right-1 flex size-5 items-center justify-center rounded-full text-xs shadow hover:scale-110"
                          title="删除此切割线"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="text-base">图块列表</CardTitle>
              <CardDescription>
                取消勾选可排除对应图块；导出时只拼接勾选的图块。
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {slices.length === 0 ? (
                <div className="text-muted-foreground text-sm">
                  尚未加载图片。
                </div>
              ) : (
                slices.map((s, idx) => (
                  <label
                    key={s.id}
                    className={cn(
                      "flex items-center gap-3 rounded-md border p-2 text-sm",
                      !s.included && "opacity-60",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={s.included}
                      onChange={() => toggleSlice(idx)}
                      className="size-4"
                    />
                    <span className="flex-1">
                      #{idx + 1}
                      <span className="text-muted-foreground ml-2 text-xs">
                        y {s.top}–{s.bottom}（{s.bottom - s.top}px）
                      </span>
                    </span>
                    {s.included ? (
                      <Eye className="size-4" />
                    ) : (
                      <EyeOff className="size-4" />
                    )}
                  </label>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <div className="bg-muted text-muted-foreground flex size-16 items-center justify-center rounded-full">
              <ImageIcon className="size-8" />
            </div>
            <p className="text-muted-foreground text-sm">
              请先选择一张本地图片开始切图
            </p>
            <Button onClick={() => fileInputRef.current?.click()}>
              <Upload />
              选择图片
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

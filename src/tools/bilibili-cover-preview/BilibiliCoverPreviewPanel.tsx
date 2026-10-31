import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, ImagePlus, Loader2, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import { CoverStage } from "./CoverStage";
import { FeedPreview } from "./FeedPreview";
import {
  INITIAL_TRANSFORM,
  MAX_ZOOM,
  MIN_ZOOM,
  clampTransform,
  exportCover,
  type CoverImage,
  type CoverTransform,
} from "./cover";
import { createFeed, type FeedState } from "./mockFeed";

export function BilibiliCoverPreviewPanel() {
  const [image, setImage] = useState<CoverImage | null>(null);
  const [transform, setTransform] = useState<CoverTransform>(INITIAL_TRANSFORM);
  const [title, setTitle] = useState("");
  const [feed, setFeed] = useState<FeedState>(() => createFeed());
  const [exporting, setExporting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const loadTokenRef = useRef(0);

  const pickFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("请选择图片文件");
      return;
    }

    const url = URL.createObjectURL(file);
    const token = loadTokenRef.current + 1;
    loadTokenRef.current = token;

    const probe = new Image();
    probe.onload = () => {
      if (token !== loadTokenRef.current) {
        URL.revokeObjectURL(url);
        return;
      }
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = url;
      setImage({
        src: url,
        name: file.name,
        width: probe.naturalWidth,
        height: probe.naturalHeight,
      });
      setTransform(INITIAL_TRANSFORM);
    };
    probe.onerror = () => {
      if (token === loadTokenRef.current) URL.revokeObjectURL(url);
      toast.error("无法读取这张图片");
    };
    probe.src = url;
  };

  useEffect(() => {
    return () => {
      loadTokenRef.current += 1;
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const zoomTo = (zoom: number) => {
    if (!image) return;
    setTransform((prev) => clampTransform({ ...prev, zoom }, image));
  };

  const handleExport = async () => {
    if (!image || exporting) return;
    setExporting(true);
    try {
      const fileName = await exportCover(image, transform, title);
      if (fileName) toast.success(`已导出 ${fileName}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导出失败");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col p-3 sm:p-4">
      <Card className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden py-0">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
          <div className="text-base font-semibold">封面预览</div>
          <Button
            size="icon"
            onClick={handleExport}
            disabled={!image || exporting}
            aria-label="导出封面"
            title="导出封面"
          >
            {exporting ? <Loader2 className="animate-spin" /> : <Download />}
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:overflow-hidden">
          <div className="flex min-h-0 min-w-0 shrink-0 flex-col gap-3 lg:shrink lg:overflow-y-auto lg:pr-1">
            <CoverStage
              image={image}
              transform={transform}
              onTransformChange={setTransform}
              onPick={pickFile}
            />

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) handleFile(file);
                  event.target.value = "";
                }}
              />
              <Button variant="outline" size="sm" onClick={pickFile}>
                <ImagePlus />
                {image ? "更换图片" : "选择图片"}
              </Button>

              <div className="ml-auto flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => zoomTo(transform.zoom - 0.25)}
                  disabled={!image || transform.zoom <= MIN_ZOOM}
                  aria-label="缩小"
                >
                  <ZoomOut />
                </Button>
                <span className="w-10 text-center text-xs tabular-nums">
                  {Math.round(transform.zoom * 100)}%
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => zoomTo(transform.zoom + 0.25)}
                  disabled={!image || transform.zoom >= MAX_ZOOM}
                  aria-label="放大"
                >
                  <ZoomIn />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setTransform(INITIAL_TRANSFORM)}
                  disabled={!image}
                  aria-label="重置"
                >
                  <RotateCcw />
                </Button>
              </div>
            </div>

            {image ? (
              <div className="text-muted-foreground truncate text-[11px]">
                {image.name} · {image.width}×{image.height}
              </div>
            ) : null}

            <div className="grid gap-1.5">
              <label
                htmlFor="bili-cover-title"
                className="text-sm font-medium"
              >
                标题
              </label>
              <input
                id="bili-cover-title"
                value={title}
                maxLength={80}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="输入视频标题"
                className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:ring-[3px]"
              />
              <div className="text-muted-foreground text-right text-xs tabular-nums">
                {title.length}/80
              </div>
            </div>

            <p className="text-muted-foreground text-xs">
              虚线内为首页 4:3 显示区域；导出的是完整 16:9 画面。
            </p>
          </div>

          <div className="flex h-[600px] min-h-0 shrink-0 flex-col lg:h-auto lg:shrink">
            <FeedPreview
              title={title}
              image={image}
              transform={transform}
              feed={feed}
              onRoll={() => setFeed(createFeed())}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}

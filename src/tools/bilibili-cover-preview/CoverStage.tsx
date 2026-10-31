import {
  useEffect,
  useRef,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from "react";
import { ImagePlus, Move } from "lucide-react";

import { cn } from "@/lib/utils";

import {
  MAX_ZOOM,
  MIN_ZOOM,
  clampTransform,
  coverFactor,
  stageImageStyle,
  type CoverImage,
  type CoverTransform,
} from "./cover";

interface CoverStageProps {
  image: CoverImage | null;
  transform: CoverTransform;
  onTransformChange: Dispatch<SetStateAction<CoverTransform>>;
  onPick: () => void;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  startTransform: CoverTransform;
  /** 舞台 CSS 像素 / 源像素 */
  scale: number;
}

export function CoverStage({
  image,
  transform,
  onTransformChange,
  onPick,
}: CoverStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!image || event.button !== 0) return;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const scale =
      (coverFactor(image.width, image.height) * transform.zoom * rect.width) / 16;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTransform: transform,
      scale,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !image) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    onTransformChange(
      clampTransform(
        {
          zoom: drag.startTransform.zoom,
          x: drag.startTransform.x - dx / (image.width * drag.scale),
          y: drag.startTransform.y - dy / (image.height * drag.scale),
        },
        image,
      ),
    );
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !image) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = stage.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const { clientX, clientY, deltaY } = event;
      onTransformChange((prev) => {
        const nextZoom = Math.min(
          MAX_ZOOM,
          Math.max(MIN_ZOOM, prev.zoom * Math.exp(-deltaY * 0.0015)),
        );
        if (Math.abs(nextZoom - prev.zoom) < 0.0001) return prev;

        const factor = coverFactor(image.width, image.height);
        const scale = (factor * prev.zoom * rect.width) / 16;
        const nextScale = (factor * nextZoom * rect.width) / 16;
        const dx = clientX - rect.left - rect.width / 2;
        const dy = clientY - rect.top - rect.height / 2;

        return clampTransform(
          {
            zoom: nextZoom,
            x: prev.x + (dx / image.width) * (1 / scale - 1 / nextScale),
            y: prev.y + (dy / image.height) * (1 / scale - 1 / nextScale),
          },
          image,
        );
      });
    };

    stage.addEventListener("wheel", handleWheel, { passive: false });
    return () => stage.removeEventListener("wheel", handleWheel);
  }, [image, onTransformChange]);

  return (
    <div
      ref={stageRef}
      className={cn(
        "relative aspect-video w-full select-none overflow-hidden rounded-lg border",
        image
          ? "cursor-grab bg-white active:cursor-grabbing"
          : "border-dashed bg-muted",
      )}
      style={{ touchAction: image ? "none" : undefined }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      {image ? (
        <>
          <img
            src={image.src}
            alt={image.name}
            draggable={false}
            className="absolute max-w-none"
            style={stageImageStyle(image, transform)}
          />
          <div className="pointer-events-none absolute inset-y-0 left-[12.5%] w-[75%] border border-dashed border-white shadow-[0_0_0_1px_rgba(0,0,0,0.28)]">
            <span className="absolute top-1 left-1 rounded bg-black/55 px-1 py-0.5 text-[10px] leading-none font-medium text-white">
              4:3
            </span>
          </div>
          <div className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white">
            <Move className="size-3" />
            拖动 / 滚轮缩放
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={onPick}
          className="text-muted-foreground hover:bg-muted/70 flex h-full w-full flex-col items-center justify-center gap-2 transition-colors"
        >
          <ImagePlus className="size-8" />
          <span className="text-sm">选择封面图片</span>
          <span className="text-xs">支持 16:9、4:3、竖图</span>
        </button>
      )}
    </div>
  );
}

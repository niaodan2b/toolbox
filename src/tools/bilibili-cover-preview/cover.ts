import type { CSSProperties } from "react";

import { isTauri } from "@tauri-apps/api/core";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";

export interface CoverImage {
  src: string;
  name: string;
  width: number;
  height: number;
}

/** x / y 是 16:9 舞台中心对应的图片归一化坐标 */
export interface CoverTransform {
  zoom: number;
  x: number;
  y: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
export const INITIAL_TRANSFORM: CoverTransform = { zoom: 1, x: 0.5, y: 0.5 };

const STAGE_W = 16;
const STAGE_H = 9;
/** 16:9 舞台中央的 4:3 区域宽度（舞台单位） */
const CROP_W = 12;
const EXPORT_W = 1920;
const EXPORT_H = 1080;
const JPEG_QUALITY = 0.92;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 覆盖 16:9 舞台所需的缩放，单位为「舞台单位 / 源像素」 */
export function coverFactor(width: number, height: number): number {
  return Math.max(STAGE_W / width, STAGE_H / height);
}

/** 把图片中心限制在舞台范围内，避免出现空白 */
export function clampTransform(
  transform: CoverTransform,
  image: Pick<CoverImage, "width" | "height">,
): CoverTransform {
  const zoom = clamp(transform.zoom, MIN_ZOOM, MAX_ZOOM);
  const f = coverFactor(image.width, image.height) * zoom;
  const halfX = STAGE_W / (2 * f * image.width);
  const halfY = STAGE_H / (2 * f * image.height);
  return {
    zoom,
    x: clamp(transform.x, halfX, 1 - halfX),
    y: clamp(transform.y, halfY, 1 - halfY),
  };
}

/** 16:9 编辑框里的图片样式 */
export function stageImageStyle(
  image: Pick<CoverImage, "width" | "height">,
  transform: CoverTransform,
): CSSProperties {
  const f = coverFactor(image.width, image.height) * transform.zoom;
  const widthPct = (image.width * f * 100) / STAGE_W;
  const heightPct = (image.height * f * 100) / STAGE_H;
  return {
    position: "absolute",
    width: `${widthPct}%`,
    height: `${heightPct}%`,
    left: `${50 - transform.x * widthPct}%`,
    top: `${50 - transform.y * heightPct}%`,
    maxWidth: "none",
    maxHeight: "none",
  };
}

/**
 * 首页 4:3 卡片里的图片样式。
 * 卡片展示的是 16:9 舞台中央 4:3 区域，源高度与舞台一致。
 */
export function cardImageStyle(
  image: Pick<CoverImage, "width" | "height">,
  transform: CoverTransform,
): CSSProperties {
  const f = coverFactor(image.width, image.height) * transform.zoom;
  const visibleHeight = STAGE_H / f;
  // 中央 4:3 区域宽度 / 舞台宽度 = 75%，换算成相对卡片宽度的百分比
  const widthPct = (image.width * CROP_W * 100) / (STAGE_W * visibleHeight);
  const heightPct = (image.height * 100) / visibleHeight;
  return {
    position: "absolute",
    width: `${widthPct}%`,
    height: `${heightPct}%`,
    left: `${50 - transform.x * widthPct}%`,
    top: `${50 - transform.y * heightPct}%`,
    maxWidth: "none",
    maxHeight: "none",
  };
}

export function titleToFileName(title: string): string {
  const base = title
    .trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .slice(0, 80)
    .trim()
    .replace(/[. ]+$/g, "");
  return `${base || "封面"}.jpg`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片加载失败"));
    image.src = src;
  });
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * 把当前 16:9 画面导出为 1920×1080 JPEG。
 * 返回实际文件名；用户取消保存对话框时返回 null。
 */
export async function exportCover(
  image: CoverImage,
  transform: CoverTransform,
  title: string,
): Promise<string | null> {
  const source = await loadImage(image.src);
  const canvas = document.createElement("canvas");
  canvas.width = EXPORT_W;
  canvas.height = EXPORT_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建画布");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, EXPORT_W, EXPORT_H);

  const f = coverFactor(image.width, image.height) * transform.zoom;
  const sourceWidth = STAGE_W / f;
  const sourceHeight = STAGE_H / f;
  const sourceX = transform.x * image.width - sourceWidth / 2;
  const sourceY = transform.y * image.height - sourceHeight / 2;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    source,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    EXPORT_W,
    EXPORT_H,
  );

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
  });
  if (!blob) throw new Error("生成图片失败");

  const fileName = titleToFileName(title);

  if (isTauri()) {
    const path = await saveDialog({
      defaultPath: fileName,
      filters: [{ name: "JPEG 图片", extensions: ["jpg", "jpeg"] }],
    });
    if (!path) return null;
    await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    return fileName;
  }

  downloadBlob(blob, fileName);
  return fileName;
}

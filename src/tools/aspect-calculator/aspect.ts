export type RatioId = "16:9" | "4:3";

export interface RatioDef {
  id: RatioId;
  /** 宽比例数值 */
  w: number;
  /** 高比例数值 */
  h: number;
  /** 实际宽高比 */
  value: number;
}

export const RATIOS: RatioDef[] = [
  { id: "16:9", w: 16, h: 9, value: 16 / 9 },
  { id: "4:3", w: 4, h: 3, value: 4 / 3 },
];

export function findRatio(id: RatioId): RatioDef {
  return RATIOS.find((r) => r.id === id) ?? RATIOS[0];
}

/** 只保留数字和一个小数点，允许空串和末尾小数点等中间状态 */
export function sanitizeLength(input: string): string {
  const cleaned = input.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  if (dot === -1) return cleaned;
  return cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, "");
}

/** 把输入解析为有效长度，无效返回 null */
export function parseLength(input: string): number | null {
  if (input.trim() === "") return null;
  const n = Number(input);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 由一边的长度按比例计算另一边 */
export function computeOther(
  source: "width" | "height",
  length: number,
  ratio: RatioDef,
): number {
  return source === "width" ? (length * ratio.h) / ratio.w : (length * ratio.w) / ratio.h;
}

/** 最多保留两位小数，去掉多余的 0 */
export function formatLength(n: number): string {
  return String(Math.round(n * 100) / 100);
}

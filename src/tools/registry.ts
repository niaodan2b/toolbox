/**
 * 工具注册表：新增工具只需在此 import 并加入数组。
 */
import type { ToolModule } from "./types";
import base64 from "./base64";
import imageSlicer from "./image-slicer";
import rhymeFinder from "./rhyme-finder";
import txtCombiner from "./txt-combiner";
import videoCounter from "./video-counter";

export const tools: ToolModule[] = [base64, imageSlicer, rhymeFinder, txtCombiner, videoCounter];

export function findTool(id: string | undefined): ToolModule | undefined {
  if (!id) return undefined;
  return tools.find((t) => t.id === id);
}

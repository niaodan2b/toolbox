import { Scissors } from "lucide-react";
import type { ToolModule } from "../types";
import { ImageSlicerPanel } from "./ImageSlicerPanel";

const imageSlicerTool: ToolModule = {
  id: "image-slicer",
  name: "切图",
  description: "水平切分本地图片为多段，排除后拼接导出",
  category: "图像",
  icon: Scissors,
  component: ImageSlicerPanel,
  keywords: ["切图", "图片", "裁剪", "拼接", "image", "slice", "split"],
};

export default imageSlicerTool;

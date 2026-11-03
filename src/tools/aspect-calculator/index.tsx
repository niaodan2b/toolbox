import { Frame } from "lucide-react";
import type { ToolModule } from "../types";
import { AspectCalculatorPanel } from "./AspectCalculatorPanel";

const aspectCalculatorTool: ToolModule = {
  id: "aspect-calculator",
  name: "画幅计算",
  description: "按 16:9 或 4:3 由宽度或高度换算另一边尺寸",
  category: "图像",
  icon: Frame,
  component: AspectCalculatorPanel,
  keywords: ["画幅", "比例", "宽高", "尺寸", "16:9", "4:3", "aspect", "ratio", "resolution"],
};

export default aspectCalculatorTool;

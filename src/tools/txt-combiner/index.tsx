import { Merge } from "lucide-react";
import type { ToolModule } from "../types";
import { TxtCombinerPanel } from "./TxtCombinerPanel";

const txtCombinerTool: ToolModule = {
  id: "txt-combiner",
  name: "TXT 合并",
  description: "将多个 TXT 文件合并为一个带中文序号标题的文件",
  category: "文本",
  icon: Merge,
  component: TxtCombinerPanel,
  keywords: ["txt", "合并", "merge", "文本", "combiner"],
};

export default txtCombinerTool;

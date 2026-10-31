import { Smartphone } from "lucide-react";
import type { ToolModule } from "../types";
import { BilibiliCoverPreviewPanel } from "./BilibiliCoverPreviewPanel";

const bilibiliCoverPreviewTool: ToolModule = {
  id: "bilibili-cover-preview",
  name: "封面预览",
  description: "预览 16:9 封面与标题在 B 站首页 4:3 卡片中的效果",
  category: "图像",
  icon: Smartphone,
  component: BilibiliCoverPreviewPanel,
  keywords: ["bilibili", "b站", "封面", "cover", "预览", "标题", "首页", "推荐"],
};

export default bilibiliCoverPreviewTool;

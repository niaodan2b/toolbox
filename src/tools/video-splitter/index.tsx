import { Scissors } from "lucide-react";
import type { ToolModule } from "../types";
import { VideoSplitterPanel } from "./VideoSplitterPanel";

const videoSplitterTool: ToolModule = {
  id: "video-splitter",
  name: "视频分割",
  description: "预览视频并标记切割点，按时间点分割导出多个片段",
  category: "媒体",
  icon: Scissors,
  component: VideoSplitterPanel,
  keywords: ["video", "视频", "分割", "split", "ffmpeg", "标记", "切割"],
};

export default videoSplitterTool;

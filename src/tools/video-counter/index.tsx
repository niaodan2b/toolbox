import { Video } from "lucide-react";
import type { ToolModule } from "../types";
import { VideoCounterPanel } from "./VideoCounterPanel";

const videoCounterTool: ToolModule = {
  id: "video-counter",
  name: "视频计时",
  description: "统计多个视频文件的总时长（分钟数）",
  category: "媒体",
  icon: Video,
  component: VideoCounterPanel,
  keywords: ["video", "视频", "时长", "duration", "counter", "分钟"],
};

export default videoCounterTool;
